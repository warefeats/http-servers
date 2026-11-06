//! What every bench server shares: the listener, the byte bodies and the JSON document
//! (docs/adr/0001-what-the-benchmark-answers.md, "The servers").

use std::{env, io, net::SocketAddr, sync::LazyLock};

use bytes::Bytes;
use serde::Serialize;
use socket2::{Domain, Socket, Type};

/// actix-web's default listen backlog, used by every server (ADR 0001, "One equalization").
pub const BACKLOG: i32 = 1024;

fn pattern(len: usize) -> Bytes {
    Bytes::from((0..len).map(|i| (i % 251) as u8).collect::<Vec<u8>>())
}

/// The `/16k` body.
pub static B16K: LazyLock<Bytes> = LazyLock::new(|| pattern(16 * 1024));
/// The `/323k` body.
pub static B323K: LazyLock<Bytes> = LazyLock::new(|| pattern(323_000));

/// Builds the byte bodies before the server answers its first request.
pub fn init() {
    LazyLock::force(&B16K);
    LazyLock::force(&B323K);
}

/// The listener every server serves on: `ADDR` (default `0.0.0.0:8080`), backlog [`BACKLOG`],
/// and with `SNDBUF` set, that send buffer for every accepted socket (local runs only).
pub fn listener() -> io::Result<std::net::TcpListener> {
    let addr: SocketAddr = env::var("ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_owned())
        .parse()
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, format!("ADDR: {e}")))?;
    let socket = Socket::new(Domain::for_address(addr), Type::STREAM, None)?;
    socket.set_reuse_address(true)?;
    if let Ok(n) = env::var("SNDBUF") {
        let n = n
            .parse()
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, format!("SNDBUF: {e}")))?;
        socket.set_send_buffer_size(n)?;
    }
    socket.bind(&addr.into())?;
    socket.listen(BACKLOG)?;
    socket.set_nonblocking(true)?;
    Ok(socket.into())
}

/// One line for the server's log: what it listens on and how it sized itself.
pub fn banner(framework: &str, listener: &std::net::TcpListener) -> io::Result<String> {
    Ok(format!(
        "{framework} listening on {}, available_parallelism={}, sndbuf={}",
        listener.local_addr()?,
        std::thread::available_parallelism().map_or(0, |n| n.get()),
        socket2::SockRef::from(listener).send_buffer_size()?,
    ))
}

#[derive(Serialize)]
pub struct Item {
    pub id: u32,
    pub sku: String,
    pub name: String,
    pub tags: Vec<&'static str>,
    pub price_cents: u64,
    pub in_stock: bool,
}

#[derive(Serialize)]
pub struct Page {
    pub page: u32,
    pub per_page: u32,
    pub total: u32,
    pub items: Vec<Item>,
}

const TAGS: [&str; 6] = ["outdoor", "steel", "refurbished", "bulk", "eco", "imported"];

/// The `/json` document, built on every request as a handler builds one from its rows:
/// eight items, about 1 KB serialized.
pub fn page() -> Page {
    let items = (0..8u32)
        .map(|i| Item {
            id: 10_000 + i,
            sku: format!("WF-{:05}-{}", 31_337 + i * 17, i % 3),
            name: format!("Item number {} of the bench catalog", i + 1),
            tags: TAGS.iter().copied().skip(i as usize % 3).take(3).collect(),
            price_cents: 1_999 + u64::from(i) * 250,
            in_stock: i % 4 != 0,
        })
        .collect();
    Page { page: 1, per_page: 8, total: 240, items }
}
