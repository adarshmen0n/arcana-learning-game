"""Retrieval over the student's own material (standard library only).

Splits the text into overlapping passages, ranks them with BM25 and
  - gives each chapter only the passages that belong to it (so long files fit small free models and the lessons stay on the upload),
  - scores how well a generated question is supported by the source (grounding check).
"""
import math
import re
from collections import Counter

STOP = set("""a an and are as at be been being but by can could did do does for from had has have he her his how i if in into is it its may might more most no not of on or our she should so such than that the their them then there these they this those to too was we were what when where which who whom why will with would you your also about after all any because before between both each few during over under again further once only other own same some very just up down out off while""".split())
TOKEN = re.compile(r"[A-Za-z0-9À-ɏ]+")


def stem(w: str) -> str:
    for suf in ("ations", "ation", "ingly", "ings", "ing", "edly", "ed", "es", "s", "ly"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            return w[: -len(suf)]
    return w


def tokens(text: str) -> list:
    return [stem(w) for w in (t.lower() for t in TOKEN.findall(text or "")) if w not in STOP and (len(w) > 2 or w.isdigit())]


def split(text: str, size: int = 130, overlap: int = 30) -> list:
    """Passages of about `size` words, cut at sentence ends where possible, with a small overlap."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n{2,}", text or "") if s.strip()]
    out, cur, n = [], [], 0
    for s in sentences:
        w = len(s.split())
        if cur and n + w > size:
            out.append(" ".join(cur))
            keep, k = [], 0
            for t in reversed(cur):
                k += len(t.split())
                if k > overlap:
                    break
                keep.insert(0, t)
            cur, n = keep, sum(len(t.split()) for t in keep)
        cur.append(s)
        n += w
    if cur:
        out.append(" ".join(cur))
    return out


class Index:
    def __init__(self, text: str):
        self.passages = split(text)
        self.toks = [tokens(p) for p in self.passages]
        self.tf = [Counter(t) for t in self.toks]
        df = Counter(w for t in self.toks for w in set(t))
        n = max(1, len(self.passages))
        self.idf = {w: math.log(1 + (n - d + 0.5) / (d + 0.5)) for w, d in df.items()}
        self.avg = (sum(len(t) for t in self.toks) / n) or 1
        self.sets = [set(t) for t in self.toks]

    def score(self, query: str) -> list:
        q = tokens(query)
        out = []
        for i, tf in enumerate(self.tf):
            L, s = len(self.toks[i]), 0.0
            for w in q:
                f = tf.get(w, 0)
                if f:
                    s += self.idf.get(w, 0) * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * L / self.avg))
            out.append(s)
        return out

    def context(self, query: str, budget_words: int = 1800) -> str:
        """The best passages for the query, in their original order, within the word budget."""
        total = sum(len(p.split()) for p in self.passages)
        if total <= budget_words:
            return "\n\n".join(self.passages)
        sc = self.score(query)
        order = sorted(range(len(self.passages)), key=lambda i: -sc[i])
        picked, used = [], 0
        for i in order:
            w = len(self.passages[i].split())
            if used + w > budget_words:
                continue
            picked.append(i)
            used += w
        return "\n\n".join(self.passages[i] for i in sorted(picked))

    def support(self, statement: str) -> float:
        """0..1: the share of the statement's content words found together in the single best passage (or two neighbouring ones)."""
        q = set(tokens(statement))
        if not q or not self.sets:
            return 1.0
        best = 0.0
        for i, s in enumerate(self.sets):
            joined = s | (self.sets[i + 1] if i + 1 < len(self.sets) else set())
            best = max(best, len(q & joined) / len(q))
        return best
