"""Forward stepwise selection over blocks of columns.

The features come in natural blocks: one category is spread over the passages
it was scored in, and those coefficients only mean something together. So a
block, not a column, is what enters the model."""

import math

import numpy as np
from scipy.stats import chi2
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression

# How much a block has to improve the deviance to be worth its `d` extra
# parameters, given `n` participants. aic and bic are the usual information
# criteria; alpha is the likelihood ratio test at p < 0.05.
CRITERIA = {
    "aic": lambda d, n: 2 * d,
    "bic": lambda d, n: d * math.log(n),
    "alpha": lambda d, n: float(chi2.isf(0.05, d)),
}


def by_category(columns) -> dict[str, list[int]]:
    """Every passage of a category enters together."""
    groups: dict[str, list[int]] = {}
    for position, column in enumerate(columns):
        _, category = column.split("_", 1)
        if category not in groups:
            groups[category] = []
        groups[category].append(position)
    return groups


def by_half(columns, early_until: int = 2) -> dict[str, list[int]]:
    """A category's early and late passages enter separately, so selection can
    keep one without the other."""
    groups: dict[str, list[int]] = {}
    for position, column in enumerate(columns):
        passage, category = column.split("_", 1)
        number = int(passage.removeprefix("passage"))
        half = "early" if number <= early_until else "late"
        name = f"{category} {half}"
        if name not in groups:
            groups[name] = []
        groups[name].append(position)
    return groups


def by_passage(columns) -> dict[str, list[int]]:
    """Every passage of every category enters on its own."""
    groups: dict[str, list[int]] = {}
    for position, column in enumerate(columns):
        groups[column] = [position]
    return groups


class GroupForward(ClassifierMixin, BaseEstimator):
    """Greedy forward selection: add the block that improves the deviance most,
    stop when the best one no longer pays for the parameters it costs.

    Selection happens here, inside fit, so a leave-one-out fold only ever
    chooses on its own training participants and a permutation re-runs the
    whole thing.

    `groups` maps a name to the column indices that enter together, so the
    grouping is the caller's to create with the functions above.
    """

    def __init__(
        self, groups: dict[str, list[int]], name: str = "", criterion: str = "aic"
    ):
        self.groups = groups
        self.name = name
        self.criterion = criterion

    def config(self) -> str:
        return f"{type(self).__name__}(name={self.name}, criterion={self.criterion})"

    def _design(self, X: np.ndarray, blocks: list[list[int]]) -> np.ndarray:
        """The matrix the regression sees: the columns of every chosen block."""
        columns: list[int] = []
        for block in blocks:
            columns.extend(block)
        return X[:, columns]

    def _fit(self, X: np.ndarray, y: np.ndarray):
        """A model on the given design, or the base rate when it is empty.

        No class weighting: CRITERIA are likelihood based and only mean what
        they say when the fit maximises that same likelihood. Weighting costs
        nothing in auc anyway, since it mostly moves the intercept."""
        if X.shape[1] == 0:
            return DummyClassifier(strategy="prior").fit(X, y)
        return LogisticRegression(max_iter=1000).fit(X, y)

    def _deviance(self, X: np.ndarray, y: np.ndarray) -> float:
        """-2 log-likelihood of the fit, how good the fit is. That is twice the
        cross-entropy, and the doubling is the scale CRITERIA is written on."""
        proba = np.asarray(self._fit(X, y).predict_proba(X), dtype=float)
        # clipped so a confident wrong call does not cost infinity
        p = np.clip(proba[:, 1], 1e-12, 1 - 1e-12)
        log_likelihood = np.sum(y * np.log(p) + (1 - y) * np.log(1 - p))
        return float(-2 * log_likelihood)

    def fit(self, X, y):
        X = np.asarray(X, dtype=float)
        y = np.asarray(y)
        if self.criterion not in CRITERIA:
            raise ValueError(
                f"criterion must be one of {tuple(CRITERIA)}, got {self.criterion!r}"
            )
        threshold = CRITERIA[self.criterion]

        left = {name: list(block) for name, block in self.groups.items()}
        chosen: list[str] = []
        chosen_blocks: list[list[int]] = []

        # the model so far, starting from one with nothing in it
        design = self._design(X, chosen_blocks)
        deviance = self._deviance(design, y)
        n_columns = design.shape[1]

        while left:
            # whichever block would fit best if it went in next
            best_name = ""
            best_deviance = 0.0
            best_n_columns = 0
            for name, block in left.items():
                candidate = self._design(X, chosen_blocks + [block])
                candidate_deviance = self._deviance(candidate, y)
                if not best_name or candidate_deviance < best_deviance:
                    best_name = name
                    best_deviance = candidate_deviance
                    best_n_columns = candidate.shape[1]

            # what it costs is how many columns the design actually grew by,
            # which the design decides: a block of four can arrive as one
            cost = best_n_columns - n_columns
            if deviance - best_deviance <= threshold(cost, len(y)):
                break

            chosen.append(best_name)
            chosen_blocks.append(left.pop(best_name))
            deviance = best_deviance
            n_columns = best_n_columns

        self.selected_ = chosen
        self.chosen_blocks_ = chosen_blocks
        design = self._design(X, chosen_blocks)
        if chosen_blocks:
            self.model_ = self._fit(design, y)
        else:
            # No opinion to give. Uniform rather than the base rate, which
            # leave-one-out would read as information about the held out
            # participant: dropping them is what moves it.
            self.model_ = DummyClassifier(strategy="uniform").fit(design, y)
        self.classes_ = np.unique(y)  # sklearn requirement...
        return self

    def predict_proba(self, X):
        X = np.asarray(X, dtype=float)
        design = self._design(X, self.chosen_blocks_)
        return np.asarray(self.model_.predict_proba(design), dtype=float)

    def predict(self, X):
        proba = self.predict_proba(X)
        return self.classes_[np.argmax(proba, axis=1)]


class MeanForward(GroupForward):
    """A block arrives as the mean of its columns, so it costs one coefficient
    however many passages it covers.

    With by_half that makes each coefficient read as how much a category's
    early or late speech matters.
    """

    def _design(self, X: np.ndarray, blocks: list[list[int]]) -> np.ndarray:
        """One column per block, holding that block's mean across its passages."""
        design = np.zeros((len(X), len(blocks)))
        for i, block in enumerate(blocks):
            design[:, i] = X[:, block].mean(axis=1)
        return design
