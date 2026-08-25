import re
# ---------------------------------------------------------------------------
# Table normalizer (safety net for pseudo-tables) — see earlier discussion.
# ---------------------------------------------------------------------------
def looks_like_table_row(line: str) -> bool:
    cols = [c for c in re.split(r"\t+|\s{2,}", line) if c.strip()]
    return len(cols) >= 2 and not line.lstrip().startswith("|")


def normalize_table_block(lines: list[str]) -> list[str]:
    def split_row(line: str) -> list[str]:
        return [c.strip() for c in re.split(r"\t+|\s{2,}", line) if c.strip()]

    rows = [split_row(l) for l in lines]
    if len(rows) < 2 or any(len(r) < 2 for r in rows):
        return lines

    col_count = max(len(r) for r in rows)
    pad = lambda r: r + [""] * (col_count - len(r))

    out = ["| " + " | ".join(pad(rows[0])) + " |"]
    out.append("|" + "|".join([" --- "] * col_count) + "|")
    for r in rows[1:]:
        out.append("| " + " | ".join(pad(r)) + " |")
    return out