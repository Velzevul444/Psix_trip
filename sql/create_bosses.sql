CREATE TABLE IF NOT EXISTS bosses (
    id BIGSERIAL PRIMARY KEY,
    boss_article_id BIGINT NOT NULL REFERENCES wiki_articles(id) ON DELETE CASCADE,
    remaining_hp INTEGER NOT NULL CHECK (remaining_hp >= 0),
    status TEXT NOT NULL CHECK (status IN ('alive', 'defeated'))
);

CREATE INDEX IF NOT EXISTS bosses_status_id_idx
    ON bosses (status, id DESC);
