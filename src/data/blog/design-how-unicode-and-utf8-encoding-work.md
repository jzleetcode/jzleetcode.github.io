---
author: JZ
pubDatetime: 2026-09-28T12:00:00Z
modDatetime: 2026-09-28T12:00:00Z
title: System Design - How Unicode and UTF-8 Encoding Work
tags:
  - design-system
description:
  "How Unicode and UTF-8 encoding work: the journey from ASCII to a universal character set, UTF-8's variable-length encoding scheme, byte structure, self-synchronization, and why it became the dominant encoding on the web."
---

## Table of contents

## Context

Every piece of text on a computer is ultimately a sequence of numbers. The question is: which number represents which character? This mapping is called a **character encoding**, and getting it wrong is why you've seen garbled text — the infamous **mojibake** (文字化け, literally "character transformation" in Japanese) — on web pages, in emails, or in terminal output.

For decades, there was no universal answer. Different countries and vendors invented their own encodings, and files created in one encoding would turn into gibberish when opened with another. Unicode and UTF-8 solved this problem so thoroughly that today, [over 98% of all web pages](https://w3techs.com/technologies/details/en-utf8) use UTF-8. Let's trace the journey from the beginning.

## ASCII: Where It All Started

In 1963, the American Standards Association published **ASCII** (American Standard Code for Information Interchange). It uses 7 bits to represent 128 characters:

```
 Decimal   Hex    Character       Decimal   Hex    Character
 ─────────────────────────       ─────────────────────────
   0-31    00-1F  Control chars     65      41     A
   32      20     (space)           66      42     B
   48      30     0                 90      5A     Z
   49      31     1                 97      61     a
   57      39     9                122      7A     z
   ...                             127      7F     DEL
```

Seven bits means values 0–127. Since most computers use 8-bit bytes, the high bit (bit 7) was always zero in ASCII. This left 128 unused positions (128–255) in each byte — an opening that would cause years of chaos.

```
  ASCII byte layout (7-bit):

  Bit:  7   6   5   4   3   2   1   0
      +---+---+---+---+---+---+---+---+
      | 0 |        ASCII value        |
      +---+---+---+---+---+---+---+---+
            always 0 for ASCII
```

ASCII worked well for English. But the world has far more than 128 characters.

## The Encoding Tower of Babel

Through the 1970s–1990s, different regions created their own encodings to fill the upper half (128–255) of each byte:

- **Latin-1 (ISO 8859-1):** Added Western European characters (é, ñ, ü) in positions 128–255.
- **Latin-2 (ISO 8859-2):** Used the same positions for Central European characters (ś, ž, ř).
- **Shift_JIS:** A variable-length encoding for Japanese, mixing single-byte ASCII with double-byte kanji.
- **GB2312 / GBK:** Encodings for Simplified Chinese.
- **EUC-KR:** Korean encoding.
- **Windows-1252:** Microsoft's superset of Latin-1, the de facto encoding on Western Windows machines.

The problem was obvious: byte value `0xE9` meant `é` in Latin-1, `š` in Latin-2, and half of a Japanese character in Shift_JIS. A file had no built-in way to declare which encoding it used. Send a French email to a Japanese computer, and you'd get mojibake.

```
  The same bytes, three different interpretations:

  Bytes:     C3 A9
  ┌──────────────────────────────────┐
  │ Latin-1:   Ã  ©    (two chars)  │
  │ Shift_JIS: [kanji]  (one char)  │
  │ UTF-8:     é        (one char)  │
  └──────────────────────────────────┘
```

The world needed a single character set that could represent every writing system.

## Unicode: One Number for Every Character

**Unicode** is not an encoding — it is a **character set**. It assigns a unique number, called a **code point**, to every character in every writing system. Code points are written as `U+` followed by hexadecimal digits:

```
  U+0041  →  A          (Latin)
  U+00E9  →  é          (Latin, accented)
  U+4E16  →  世         (Chinese: "world")
  U+1F600 →  😀         (Emoji: grinning face)
  U+0915  →  क          (Devanagari)
  U+0410  →  А          (Cyrillic)
```

The Unicode code space ranges from `U+0000` to `U+10FFFF` — that's 1,114,112 possible code points. As of Unicode 16.0 (September 2024), about 154,998 characters are assigned, covering 168 scripts.

The first 128 code points (`U+0000` to `U+007F`) are identical to ASCII. This was a deliberate design decision to ensure backward compatibility.

But a code point is an abstract number. To store it in a file, you need an **encoding** — a rule that converts code points into bytes. This is where UTF-8 comes in.

## UTF-8: The Elegant Encoding

UTF-8 was invented in September 1992 by Ken Thompson and Rob Pike over dinner at a New Jersey diner. Thompson wrote the design on a placemat. Pike [recalls the story](https://www.cl.cam.ac.uk/~mgk25/ucs/utf-8-history.txt): they needed an encoding for the Plan 9 operating system that was backward-compatible with ASCII, self-synchronizing, and efficient for English text.

UTF-8 is a **variable-length encoding**: it uses 1 to 4 bytes per character. The number of bytes depends on the code point's value:

```
  Code Point Range          Bytes   Byte Pattern
  ────────────────────────  ─────   ────────────────────────────────
  U+0000  .. U+007F           1     0xxxxxxx
  U+0080  .. U+07FF           2     110xxxxx  10xxxxxx
  U+0800  .. U+FFFF           3     1110xxxx  10xxxxxx  10xxxxxx
  U+10000 .. U+10FFFF         4     11110xxx  10xxxxxx  10xxxxxx  10xxxxxx
```

The `x` bits carry the actual code point value. The leading bits of each byte tell you exactly what role that byte plays:

- **`0xxxxxxx`** — single-byte character (ASCII). The leading `0` means "this is a complete character in one byte."
- **`110xxxxx`** — first byte of a 2-byte sequence. The `110` prefix means "two bytes total."
- **`1110xxxx`** — first byte of a 3-byte sequence.
- **`11110xxx`** — first byte of a 4-byte sequence.
- **`10xxxxxx`** — continuation byte. Every non-first byte starts with `10`.

This design has several brilliant properties. Let's walk through them.

## Encoding in Action

Let's encode three characters by hand to see the machinery:

**Example 1: `A` (U+0041)**

Code point 0x41 = binary `1000001` = decimal 65. It fits in 7 bits, so it's a 1-byte sequence:

```
  U+0041 → 0x41 → 0 1000001
                   ↑
                   leading 0 = single byte (ASCII)

  Result: [0x41]   (identical to ASCII)
```

**Example 2: `é` (U+00E9)**

Code point 0xE9 = binary `11101001` = 8 bits. Too large for 1 byte (max 7 payload bits), fits in 2 bytes (max 11 payload bits):

```
  Binary: 000 11101001
  Split:      ┌─────┐┌──────┐
              │00011│ │101001│
              └──┬──┘ └──┬───┘
                 │       │
  Byte 1:  110 00011     │       (prefix 110 = "2-byte sequence starts")
  Byte 2:       10 101001        (prefix 10  = "continuation byte")

  Result: [0xC3, 0xA9]
```

**Example 3: `世` (U+4E16)**

Code point 0x4E16 = binary `0100 111000 010110` = 16 bits. Needs 3 bytes (max 16 payload bits):

```
  Binary: 0100 111000 010110
  Split:  ┌────┐┌──────┐┌──────┐
          │0100│ │111000│ │010110│
          └──┬─┘ └──┬───┘ └──┬───┘
             │      │        │
  Byte 1: 1110 0100 │        │    (prefix 1110 = "3-byte sequence")
  Byte 2:      10 111000     │    (prefix 10 = continuation)
  Byte 3:           10 010110     (prefix 10 = continuation)

  Result: [0xE4, 0xB8, 0x96]
```

**Example 4: `😀` (U+1F600)**

Code point 0x1F600 = binary `000 011111 011000 000000` = 21 bits. Needs 4 bytes:

```
  Binary: 000 011111 011000 000000
  Split:  ┌───┐┌──────┐┌──────┐┌──────┐
          │000│ │011111│ │011000│ │000000│
          └─┬─┘ └──┬───┘ └──┬───┘ └──┬───┘
            │      │        │        │
  Byte 1: 11110 000│        │        │  (prefix 11110 = "4-byte sequence")
  Byte 2:     10 011111     │        │
  Byte 3:          10 011000│        │
  Byte 4:               10 000000

  Result: [0xF0, 0x9F, 0x98, 0x80]
```

You can verify any of these in Python:

```python
>>> 'é'.encode('utf-8')
b'\xc3\xa9'
>>> '世'.encode('utf-8')
b'\xe4\xb8\x96'
>>> '😀'.encode('utf-8')
b'\xf0\x9f\x98\x80'
```

## Why UTF-8 Won: Five Design Properties

### 1. ASCII Compatibility

Every valid ASCII file is already a valid UTF-8 file, byte-for-byte identical. This meant that the entire English-language internet, C source code, Unix config files, and HTTP headers needed zero changes. No other Unicode encoding has this property.

### 2. Self-Synchronization

If you jump into the middle of a UTF-8 byte stream, you can always find the start of the next character. Just scan forward until you find a byte that does NOT start with `10`:

```
  Stream: ... [10 xxxxxx] [10 xxxxxx] [1110 xxxx] [10 xxxxxx] [10 xxxxxx] ...
               continuation  continuation  ↑ START     continuation  continuation
                                           │
                                     3-byte sequence begins here
```

This is impossible with many older encodings. In Shift_JIS, if you lose one byte, you can misparse the entire rest of the file.

### 3. No Embedded NULLs

The only byte that is `0x00` in UTF-8 is the NULL character itself (`U+0000`). C strings use `0x00` as a terminator, so UTF-8 strings work correctly with all existing C string functions like `strlen()`, `strcmp()`, and `strcpy()`. This is NOT true for UTF-16, where characters like `A` are encoded as `0x00 0x41` — the embedded zero would prematurely terminate a C string.

### 4. Sorting Preserves Code Point Order

If you sort UTF-8 strings by raw byte values (as `memcmp` or `strcmp` would), the result is the same as sorting by Unicode code point values. This property (called **byte-order preservation**) means existing sort algorithms and indexes work correctly without modification.

### 5. Unique Byte Sequences

Every code point maps to exactly one byte sequence. There's no way to encode `U+0041` as a 2-byte sequence — the encoding rules forbid "overlong" sequences. This prevents security vulnerabilities where an attacker might use an overlong encoding of `/` (slash) to bypass path validation:

```
  U+002F (slash):
    Legal:   [0x2F]                     →  /
    Illegal: [0xC0, 0xAF]              →  overlong 2-byte encoding
    Illegal: [0xE0, 0x80, 0xAF]        →  overlong 3-byte encoding

  A naive decoder that accepts overlong forms could be tricked
  into seeing a "/" where a security check saw safe bytes.
```

This was a real vulnerability (CVE-2000-0884 in IIS, among others). The UTF-8 spec explicitly forbids overlong encodings, and modern decoders reject them.

## UTF-8 vs. UTF-16 vs. UTF-32

Unicode defines three standard encodings:

```
  Encoding   Bytes/char   Byte order    NULL-safe   ASCII compat
  ─────────  ──────────   ──────────    ─────────   ────────────
  UTF-8      1–4          N/A           Yes         Yes
  UTF-16     2 or 4       BOM needed    No          No
  UTF-32     4 (fixed)    BOM needed    No          No
```

**UTF-16** uses 2 bytes for code points up to `U+FFFF` and 4 bytes (a "surrogate pair") for higher code points. It was popular in the 1990s when Unicode was thought to fit in 16 bits. Java, JavaScript, Windows, and .NET all use UTF-16 internally. The downside: it's neither compact for ASCII nor fixed-width for all characters.

**UTF-32** uses a fixed 4 bytes per character. Simple to index — `s[i]` is always at byte offset `4*i` — but wastes 75% of space for ASCII text.

**UTF-8** dominates for storage and transmission because it's compact for ASCII-heavy text (most source code, HTML, JSON, protocols) and has all the compatibility properties listed above.

```
  Space usage for "Hello, 世界!" (11 code points):

  UTF-8:    14 bytes  (ASCII chars = 1 byte each, CJK = 3 bytes each)
  UTF-16:   22 bytes  (all chars in BMP = 2 bytes each, no surrogates needed)
  UTF-32:   44 bytes  (4 bytes × 11)
```

## The Surrogate Gap

When Unicode was extended beyond `U+FFFF`, UTF-16 needed a way to encode higher code points. It reserved code points `U+D800` to `U+DFFF` (2,048 values) as **surrogates** — they are not valid characters and exist only as a UTF-16 encoding mechanism:

```
  To encode U+1F600 (😀) in UTF-16:

  1. Subtract 0x10000:  0x1F600 - 0x10000 = 0xF600
  2. Split into 10+10 bits:  0xF600 = 0000111101  1000000000
  3. High surrogate: 0xD800 + 0x003D = 0xD83D
  4. Low surrogate:  0xDC00 + 0x0200 = 0xDE00

  UTF-16 bytes (big-endian): D8 3D DE 00
```

UTF-8 has no surrogates. It encodes `U+10000`–`U+10FFFF` directly in 4 bytes. UTF-8 decoders must reject any byte sequence that would decode to a surrogate code point — another guard against invalid data.

## Common Pitfalls

### String Length ≠ Byte Length

In UTF-8, one "character" (code point) can be 1–4 bytes. Most languages report string length in code points or UTF-16 code units, not bytes:

```python
s = "café"
len(s)                   # 4 (code points)
len(s.encode('utf-8'))   # 5 (bytes: c=1, a=1, f=1, é=2)
```

### Grapheme Clusters

What a human perceives as a single "character" may be multiple code points. The flag emoji 🇫🇷 is two code points (`U+1F1EB` + `U+1F1F7`), and some emoji like 👨‍👩‍👧‍👦 are seven code points joined by zero-width joiners:

```
  👨‍👩‍👧‍👦 = U+1F468 U+200D U+1F469 U+200D U+1F467 U+200D U+1F466
          man    ZWJ    woman   ZWJ    girl    ZWJ    boy

  7 code points, 25 UTF-8 bytes, but 1 visible grapheme cluster.
```

### The BOM (Byte Order Mark)

`U+FEFF` is the Byte Order Mark. In UTF-16 and UTF-32, it appears at the start of a file to indicate byte order (big-endian vs. little-endian). In UTF-8, byte order is irrelevant (bytes are always single units), so a BOM is unnecessary and discouraged — but some Windows tools add it anyway. A UTF-8 BOM is the 3-byte sequence `EF BB BF` at the start of a file, and it can confuse parsers that don't expect it.

## Decoding Algorithm

Here's a simplified UTF-8 decoder in C, showing the core logic:

```c
// Decode one UTF-8 character from *p, advance *p past it.
// Returns the code point, or -1 on invalid input.
int32_t utf8_decode(const uint8_t **p) {
    uint8_t b = **p;
    int32_t cp;
    int remaining;

    if (b < 0x80) {                     // 0xxxxxxx
        (*p)++;
        return b;
    } else if ((b & 0xE0) == 0xC0) {   // 110xxxxx
        cp = b & 0x1F;
        remaining = 1;
    } else if ((b & 0xF0) == 0xE0) {   // 1110xxxx
        cp = b & 0x0F;
        remaining = 2;
    } else if ((b & 0xF8) == 0xF0) {   // 11110xxx
        cp = b & 0x07;
        remaining = 3;
    } else {
        (*p)++;
        return -1;                       // invalid lead byte
    }

    (*p)++;
    for (int i = 0; i < remaining; i++) {
        uint8_t cont = **p;
        if ((cont & 0xC0) != 0x80)      // must be 10xxxxxx
            return -1;
        cp = (cp << 6) | (cont & 0x3F);
        (*p)++;
    }

    // Reject overlong encodings and surrogates
    if (cp < 0x80 && remaining > 0)   return -1;
    if (cp < 0x800 && remaining > 1)  return -1;
    if (cp < 0x10000 && remaining > 2) return -1;
    if (cp >= 0xD800 && cp <= 0xDFFF) return -1;
    if (cp > 0x10FFFF)               return -1;

    return cp;
}
```

The bit-mask checks (`b & 0xE0 == 0xC0`) work because the prefix bits are fixed by the encoding rules. The decoder shifts in 6 payload bits from each continuation byte, building up the code point left-to-right.

## Historical Timeline

```
  1963  ASCII published (7-bit, 128 characters)
        │
  1970s Latin-1, Shift_JIS, GB2312 — regional encodings proliferate
        │
  1987  Joe Becker (Xerox), Lee Collins, Mark Davis begin designing
        a universal character set
        │
  1991  Unicode 1.0 published (7,161 characters, believed to fit in 16 bits)
        │
  1992  Ken Thompson & Rob Pike design UTF-8 at a diner in New Jersey
        │
  1993  UTF-8 adopted by Plan 9, published as RFC 2279
        │
  1996  Unicode 2.0 — extended beyond 65,536 characters (surrogates added)
        │
  2003  RFC 3629 restricts UTF-8 to U+0000..U+10FFFF (4 bytes max)
        │
  2008  UTF-8 surpasses ASCII as the most common encoding on the web
        │
  2024  UTF-8 used by 98.3% of all websites
```

## References

1. Unicode Consortium, [The Unicode Standard](https://www.unicode.org/versions/latest/).
2. Ken Thompson & Rob Pike, [UTF-8 history](https://www.cl.cam.ac.uk/~mgk25/ucs/utf-8-history.txt).
3. RFC 3629, [UTF-8, a transformation format of ISO 10646](https://www.rfc-editor.org/rfc/rfc3629).
4. Joel Spolsky, [The Absolute Minimum Every Software Developer Absolutely, Positively Must Know About Unicode and Character Sets (No Excuses!)](https://www.joelonsoftware.com/2003/10/08/the-absolute-minimum-every-software-developer-absolutely-positively-must-know-about-unicode-and-character-sets-no-excuses/).
5. W3Techs, [Usage of character encodings for websites](https://w3techs.com/technologies/details/en-utf8).
