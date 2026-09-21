import numpy as np
import pandas as pd

from extractors.base import FeatureExtractor
from extractors.taxonomy import codebook
from extractors.taxonomy.coders import Coder
from extractors.taxonomy.levels import Level
from extractors.taxonomy.scopes import Scope
from extractors.taxonomy.segments import Segmenter


class TaxonomyExtractor(FeatureExtractor):
    """What verbal behavior did this participant engage in, as one number per
    category or cluster.
    """

    def __init__(
        self,
        scope: Scope,
        segments: Segmenter,
        coder: Coder,
        level: Level,
    ):
        self.scope = scope
        self.segments = segments
        self.coder = coder
        self.level = level

    def unit_scores(self, participant: str) -> pd.DataFrame:
        """One row per unit (segment of speech), one column per category, values in [0, 1] = the
        fraction of seeds that picked it."""
        units = self.segments.split(self.scope.select(participant))
        if not units:
            # dtype, or _extract's isnan gets an object array
            return pd.DataFrame(columns=codebook.categories(), dtype=float)
        scores = np.full((len(units), len(codebook.categories())), np.nan)
        spoken = [i for i, unit in enumerate(units) if unit]
        if spoken:
            scores[spoken] = self.coder.score(
                [units[i] for i in spoken],
                self.segments.prompt_granularity,
                participant,
            )
        return pd.DataFrame(
            scores,
            columns=codebook.categories(),
            index=pd.RangeIndex(1, len(units) + 1, name="unit"),
        )

    def _extract(self, participant: str) -> dict[str, float]:
        scores = self.unit_scores(participant).to_numpy()
        if not len(scores) or np.isnan(scores).all():
            # silent participants should have been filterd out earlier
            raise ValueError(f"{participant} said nothing in {self.scope!r}")
        pooled = self.segments.pool(scores)
        if pooled.ndim == 1:
            return self.level.report(pooled)
        # unpooled, so there is a vector per unit (segment of speech) rather
        # than one in total. The level names each of them the same way, so the
        # segmenter's own word for a unit and its number keep the names apart.
        label = codebook.UNIT_LABEL[self.segments.prompt_granularity].lower()
        return {
            f"{label}{i}_{name}": value
            for i, row in enumerate(pooled, 1)
            for name, value in self.level.report(row).items()
        }
