//! rama bench server (docs/adr/0001-what-the-benchmark-answers.md, "The servers"),
//! written the way rama's examples show: a web `Router` in an `HttpServer::auto`, served by a
//! `TcpListener` under `#[tokio::main]`.

use std::{io, sync::Arc};

use bench_common::{
    banner, catalog, file_path, fresh_323k, init, listener, page, B16K, B323K, JSON_323K_ITEMS,
    JSON_40K_ITEMS,
};
use rama::{
    http::{
        layer::error_handling::ErrorHandlerLayer,
        server::HttpServer,
        service::{
            fs::ServeFile,
            web::{response::Json, Router},
        },
    },
    rt::Executor,
    tcp::server::TcpListener,
    Layer,
};

#[tokio::main]
async fn main() -> io::Result<()> {
    init()?;
    let std_listener = listener()?;
    eprintln!("{}", banner("rama", &std_listener)?);
    let listener = TcpListener::try_from_std_tcp_listener(std_listener, Executor::default())?;
    // `Bytes` answers with `Content-Type: application/octet-stream`, as the actix-web server sets.
    // The file goes through rama's `ServeFile`, the way rama's examples serve one.
    let router = Router::new()
        .with_get("/json", async || Json(page()))
        .with_get("/json-40k", async || Json(catalog(JSON_40K_ITEMS)))
        .with_get("/json-323k", async || Json(catalog(JSON_323K_ITEMS)))
        .with_get("/16k", async || B16K.clone())
        .with_get("/323k", async || B323K.clone())
        .with_get("/323k-fresh", async || fresh_323k())
        .with_get("/file", ServeFile::new(file_path()));
    // a router's 404 and 405 are errors; `ErrorHandlerLayer` answers them, as rama's router examples do
    let app = Arc::new(ErrorHandlerLayer::new().into_layer(router));
    let server = HttpServer::auto(Executor::default()).service(app);
    listener.serve(server).await;
    Ok(())
}
