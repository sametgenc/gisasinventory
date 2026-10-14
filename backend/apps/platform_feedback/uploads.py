"""Validate every attachment before creating records or writing stored files."""

import mimetypes
import re
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

from rest_framework.exceptions import ValidationError

MAX_FILES = 5
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_TOTAL_BYTES = 15 * 1024 * 1024
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.pdf', '.txt', '.csv', '.xlsx', '.docx'}


def clean_filename(filename):
    name = PurePosixPath(filename.replace('\\', '/')).name
    name = re.sub(r'[\x00-\x1f\x7f]', '_', name).strip().strip('.')
    return name[:255] or 'attachment'


def _matches_extension(upload, extension):
    position = upload.tell()
    try:
        upload.seek(0)
        header = upload.read(1024)
        if extension == '.png':
            return header.startswith(b'\x89PNG\r\n\x1a\n')
        if extension in {'.jpg', '.jpeg'}:
            return header.startswith(b'\xff\xd8\xff')
        if extension == '.webp':
            return header.startswith(b'RIFF') and header[8:12] == b'WEBP'
        if extension == '.pdf':
            return header.startswith(b'%PDF-')
        if extension in {'.xlsx', '.docx'}:
            if not header.startswith(b'PK\x03\x04'):
                return False
            upload.seek(0)
            try:
                with ZipFile(upload) as archive:
                    required = 'xl/workbook.xml' if extension == '.xlsx' else 'word/document.xml'
                    return required in archive.namelist() and '[Content_Types].xml' in archive.namelist()
            except (BadZipFile, OSError, UnicodeDecodeError):
                return False
        upload.seek(0)
        text_bytes = upload.read(MAX_FILE_BYTES + 1)
        if b'\0' in text_bytes:
            return False
        try:
            text_bytes.decode('utf-8-sig')
            return True
        except UnicodeDecodeError:
            return False
    finally:
        upload.seek(position)


def validate_uploads(files):
    if len(files) > MAX_FILES:
        raise ValidationError({'files': 'En fazla 5 dosya ekleyebilirsiniz.'})
    if sum(upload.size for upload in files) > MAX_TOTAL_BYTES:
        raise ValidationError({'files': 'Dosyaların toplamı 15 MB sınırını aşamaz.'})
    validated = []
    for upload in files:
        name = clean_filename(upload.name)
        extension = PurePosixPath(name).suffix.lower()
        if not upload.size or upload.size > MAX_FILE_BYTES:
            raise ValidationError({'files': 'Her dosya boş olmamalı ve en fazla 5 MB olmalıdır.'})
        if extension not in ALLOWED_EXTENSIONS or not _matches_extension(upload, extension):
            raise ValidationError({'files': 'Geçersiz dosya. PNG, JPEG, WebP, PDF, TXT, CSV, XLSX veya DOCX kullanın.'})
        content_type = mimetypes.guess_type(name)[0] or 'application/octet-stream'
        validated.append((upload, name, content_type))
    return validated
