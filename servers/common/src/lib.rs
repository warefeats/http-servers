//! What every bench server shares: the listener, the byte bodies, the file and the JSON document
//! (docs/adr/0001-what-the-benchmark-answers.md, "The servers").

use std::{
    env,
    fs::{self, File},
    io::{self, BufWriter, Write},
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::LazyLock,
};

use bytes::Bytes;
use serde::Serialize;
use socket2::{Domain, Socket, Type};

/// actix-web's default listen backlog, used by every server (ADR 0001, "One equalization").
pub const BACKLOG: i32 = 1024;

/// Every byte body and the file hold byte `i % PERIOD` at offset `i`.
const PERIOD: usize = 251;

fn pattern(len: usize) -> Bytes {
    Bytes::from((0..len).map(|i| (i % PERIOD) as u8).collect::<Vec<u8>>())
}

/// The `/16k` body.
pub static B16K: LazyLock<Bytes> = LazyLock::new(|| pattern(16 * 1024));
/// The `/323k` body, one buffer that every response clones.
pub static B323K: LazyLock<Bytes> = LazyLock::new(|| pattern(323_000));

/// The `/323k-fresh` body: the bytes of `/323k` copied into a new buffer, as a handler builds a
/// body of its own on every request.
pub fn fresh_323k() -> Bytes {
    Bytes::copy_from_slice(&B323K)
}

/// The size of the file `/file` serves.
pub const FILE_LEN: u64 = 64 * 1024 * 1024;

/// The file `/file` serves, in the server's temp directory.
pub fn file_path() -> PathBuf {
    env::temp_dir().join("http-servers-bench-64m.bin")
}

/// Writes the file in blocks of whole pattern periods, so no block needs the whole file in memory
/// and every block starts where the last one left off.
fn write_file(path: &Path) -> io::Result<()> {
    let block: Vec<u8> = (0..PERIOD * 4096).map(|i| (i % PERIOD) as u8).collect();
    let mut out = BufWriter::new(File::create(path)?);
    let mut left = FILE_LEN;
    while left > 0 {
        let n = left.min(block.len() as u64) as usize;
        out.write_all(&block[..n])?;
        left -= n as u64;
    }
    out.into_inner()
        .map_err(io::IntoInnerError::into_error)?
        .sync_all()
}

/// Builds the byte bodies, and writes the file when it is missing, before the server answers its
/// first request.
pub fn init() -> io::Result<()> {
    LazyLock::force(&B16K);
    LazyLock::force(&B323K);
    let path = file_path();
    if fs::metadata(&path).map(|m| m.len()).ok() != Some(FILE_LEN) {
        // under a temporary name first, so no server ever serves part of the file
        let tmp = path.with_extension(format!("{}.tmp", std::process::id()));
        write_file(&tmp)?;
        fs::rename(&tmp, &path)?;
    }
    Ok(())
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
    catalog(8)
}

/// Items in the `/json-40k` document: 40,039 bytes serialized, past the 32 KiB at which actix-web
/// #4302 writes a body from its own buffer and under the 128 KiB write buffer actix-web keeps.
pub const JSON_40K_ITEMS: u32 = 263;
/// Items in the `/json-323k` document: 323,142 bytes serialized, the size of `/323k`.
pub const JSON_323K_ITEMS: u32 = 2_100;

/// A page of `items` items, built on every request like `/json`'s. actix-web's `.json()` serializes
/// it into a `String` that grows by doubling, so the bytes sit in more memory than they fill: 40,039
/// bytes in 64 KiB, 323,142 in 512 KiB.
pub fn catalog(items: u32) -> Page {
    let rows = (0..items)
        .map(|i| Item {
            id: 10_000 + i,
            sku: format!("WF-{:05}-{}", 31_337 + i * 17, i % 3),
            name: format!("Item number {} of the bench catalog", i + 1),
            tags: TAGS.iter().copied().skip(i as usize % 3).take(3).collect(),
            price_cents: 1_999 + u64::from(i) * 250,
            in_stock: i % 4 != 0,
        })
        .collect();
    Page { page: 1, per_page: items, total: 30 * items, items: rows }
}
