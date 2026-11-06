//! actix-web bench server (docs/adr/0001-what-the-benchmark-answers.md, "The servers"),
//! written the way actix-web's docs show: `HttpServer` with an `App` of routes, at its defaults.

use std::io;

use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use bench_common::{banner, init, listener, page, B16K, B323K};

async fn json() -> impl Responder {
    HttpResponse::Ok().json(page())
}

async fn b16k() -> impl Responder {
    HttpResponse::Ok()
        .content_type("application/octet-stream")
        .body(B16K.clone())
}

async fn b323k() -> impl Responder {
    HttpResponse::Ok()
        .content_type("application/octet-stream")
        .body(B323K.clone())
}

#[actix_web::main]
async fn main() -> io::Result<()> {
    init();
    let listener = listener()?;
    eprintln!("{}", banner("actix-web", &listener)?);
    HttpServer::new(|| {
        App::new()
            .route("/json", web::get().to(json))
            .route("/16k", web::get().to(b16k))
            .route("/323k", web::get().to(b323k))
    })
    .listen(listener)?
    .run()
    .await
}
