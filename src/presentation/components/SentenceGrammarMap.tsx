import type {
  GrammarChunk,
  GrammarToken,
} from "../../domain/content/SentenceLearningSupport";

export type TokenizedGrammarChunk = GrammarChunk & {
  tokens: [GrammarToken, ...GrammarToken[]];
};

interface SentenceGrammarMapProps {
  chunks: readonly TokenizedGrammarChunk[];
}

export function SentenceGrammarMap({
  chunks,
}: SentenceGrammarMapProps) {
  return (
    <section
      aria-label="Sentence grammar"
      className="learning-support-block sentence-grammar-map"
    >
      <ol
        aria-label="Sentence structure map"
        className="sentence-grammar-track"
        tabIndex={0}
      >
        {chunks.map((chunk, chunkIndex) => (
          <li
            aria-label={describeGrammarChunk(chunk)}
            className={`sentence-grammar-group grammar-role-${chunk.role} has-token-detail`}
            key={`${chunk.text}-${chunkIndex}`}
          >
            <div aria-hidden="true" className="sentence-grammar-group-visual">
              <span className="sentence-grammar-role-label" lang="zh-CN">
                {chunk.label}
              </span>

              <div className="sentence-grammar-tokens">
                {chunk.tokens.map((token, tokenIndex) => (
                  <span
                    className="sentence-grammar-token"
                    key={`${token.text}-${tokenIndex}`}
                  >
                    <small className="sentence-grammar-token-ipa">{token.ipa}</small>
                    <strong lang="en">{token.text}</strong>
                    <span className="sentence-grammar-token-rule" />
                    <span className="sentence-grammar-token-gloss" lang="zh-CN">
                      {token.gloss}
                    </span>
                    <small className="sentence-grammar-token-pos" lang="zh-CN">
                      {token.partOfSpeech}
                    </small>
                  </span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function describeGrammarChunk(chunk: TokenizedGrammarChunk): string {
  const tokenDescriptions = chunk.tokens.map((token) => (
    `${token.text}; pronunciation ${token.ipa}; meaning ${token.gloss}; part of speech ${token.partOfSpeech}`
  ));

  return `${chunk.label}: ${tokenDescriptions.join(". ")}.`;
}

export function hasCompleteGrammarTokenDetails(
  chunks: readonly GrammarChunk[],
): chunks is readonly TokenizedGrammarChunk[] {
  return chunks.length > 0 && chunks.every((chunk) => {
    const tokens = chunk.tokens;

    if (!tokens?.length) {
      return false;
    }

    return tokens.every((token) => (
      token.text.trim().length > 0
      && token.ipa.trim().length > 0
      && token.gloss.trim().length > 0
      && token.partOfSpeech.trim().length > 0
    ));
  });
}
