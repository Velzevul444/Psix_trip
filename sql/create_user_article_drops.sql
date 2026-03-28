CREATE TABLE IF NOT EXISTS user_article_drops (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_id BIGINT NOT NULL REFERENCES wiki_articles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_article_drops_user_created_idx
    ON user_article_drops (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_article_drops_user_article_idx
    ON user_article_drops (user_id, article_id);
