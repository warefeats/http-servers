//! axum bench server (docs/adr/0001-what-the-benchmark-answers.md, "The servers"),
//! written the way axum's docs show: a `Router` served by `axum::serve` under `#[tokio::main]`.

use std::{convert::Infallible, io};

use axum::{routing::get, Json, Router};
use bench_common::{
    banner, catalog, file_path, fresh_323k, init, listener, page, B16K, B323K, JSON_323K_ITEMS,
    JSON_40K_ITEMS,
};
use tower_http::services::ServeFile;

/// axum 0.8.9's `serve` resolves to `io::Result<()>`; its main branch's never returns.
trait ServeOutcome {
    fn into_result(self) -> io::Result<()>;
}

impl ServeOutcome for io::Result<()> {
    fn into_result(self) -> io::Result<()> {
        self
    }
}

impl ServeOutcome for Infallible {
    fn into_result(self) -> io::Result<()> {
        match self {}
    }
}

#[tokio::main]
async fn main() -> io::Result<()> {
    init()?;
    let std_listener = listener()?;
    eprintln!("{}", banner("axum", &std_listener)?);
    let listener = tokio::net::TcpListener::from_std(std_listener)?;
    // `Bytes` answers with `Content-Type: application/octet-stream`, as the actix-web server sets.
    // The file goes through tower-http's `ServeFile`, the way axum's docs serve one.
    let app = Router::new()
        .route("/json", get(|| async { Json(page()) }))
        .route("/json-40k", get(|| async { Json(catalog(JSON_40K_ITEMS)) }))
        .route("/json-323k", get(|| async { Json(catalog(JSON_323K_ITEMS)) }))
        .route("/16k", get(|| async { B16K.clone() }))
        .route("/323k", get(|| async { B323K.clone() }))
        .route("/323k-fresh", get(|| async { fresh_323k() }))
        .route_service("/file", ServeFile::new(file_path()));
    axum::serve(listener, app).await.into_result()
}
