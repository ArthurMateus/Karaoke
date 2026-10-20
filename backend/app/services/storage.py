"""File storage over the S3 API (SeaweedFS locally; AWS S3, Cloudflare R2, ... in production)."""

from collections.abc import Iterator
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import get_settings


@lru_cache
def _client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 3}),
    )


def _bucket() -> str:
    return get_settings().s3_bucket


def ensure_bucket() -> None:
    try:
        _client().head_bucket(Bucket=_bucket())
    except ClientError:
        _client().create_bucket(Bucket=_bucket())


def upload_file(key: str, path: Path, content_type: str) -> None:
    _client().upload_file(str(path), _bucket(), key, ExtraArgs={"ContentType": content_type})


def upload_bytes(key: str, data: bytes, content_type: str) -> None:
    _client().put_object(Bucket=_bucket(), Key=key, Body=data, ContentType=content_type)


def download_file(key: str, path: Path) -> None:
    _client().download_file(_bucket(), key, str(path))


def read_bytes(key: str) -> bytes:
    return _client().get_object(Bucket=_bucket(), Key=key)["Body"].read()


def delete_key(key: str) -> None:
    """Delete one file (no error if it's already gone)."""
    _client().delete_object(Bucket=_bucket(), Key=key)


def delete_prefix(prefix: str) -> None:
    client = _client()
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=_bucket(), Prefix=prefix):
        for obj in page.get("Contents", []):
            client.delete_object(Bucket=_bucket(), Key=obj["Key"])


@dataclass
class ObjectStream:
    body: Iterator[bytes]
    content_type: str
    content_length: int
    content_range: str | None  # set when only part of the file was asked for
    total_size: int


class RangeNotSatisfiable(Exception):
    pass


def open_stream(key: str, range_header: str | None = None) -> ObjectStream:
    """Stream a file to the browser. Audio players ask for byte ranges to seek."""
    kwargs = {"Bucket": _bucket(), "Key": key}
    if range_header:
        kwargs["Range"] = range_header
    try:
        response = _client().get_object(**kwargs)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "InvalidRange":
            raise RangeNotSatisfiable() from None
        raise
    content_range = response.get("ContentRange")
    total = int(content_range.rsplit("/", 1)[1]) if content_range else response["ContentLength"]
    return ObjectStream(
        body=response["Body"].iter_chunks(64 * 1024),
        content_type=response.get("ContentType", "application/octet-stream"),
        content_length=response["ContentLength"],
        content_range=content_range,
        total_size=total,
    )
