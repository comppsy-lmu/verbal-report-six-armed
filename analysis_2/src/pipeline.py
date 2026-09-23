import hashlib
import json
import re

import numpy as np
import pandas as pd
from sklearn import config_context
from sklearn.base import clone
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold

from utils import data, llm
from utils.paths import OUTPUT

PROGRESS = False  # main.py turns this on


def cohort(limit: int | None = None) -> tuple[list[str], pd.Series]:
    """Analyzable participants that also carry a behavioral label."""
    labels = data.vr()["aware"].dropna().astype(int)
    return [p for p in data.analyzable_participants() if p in labels.index][
        :limit
    ], labels


def slug(config: str) -> str:
    """Readable one-line form of a config."""
    config = re.sub(r"\b\w+=(?=\w+\()", "", config)
    return re.sub(r"[^0-9A-Za-z]+", "-", config).strip("-")[:200]


def scores_config(extractor) -> str:
    """Names the per-unit scores, so configs that produce the same ones share a
    file. Pooling and the level act on the scores afterwards, so they are out."""
    with config_context(print_changed_only=False):  # spell out every parameter
        config = " ".join(
            repr(o) for o in (extractor.coder, extractor.scope, extractor.segments)
        )
    return re.sub(r"pooling='\w+', ?", "", config)


def calls_config(extractor) -> str:
    """Names the set of requests, so configs that ask the model the same things
    share one review file. Ranking only decides how a reply is read, and the
    replies are the same either way, so it drops out too."""
    return re.sub(r"ranking='\w+', ?", "", scores_config(extractor))


def _filename(config: str) -> str:
    return f"{slug(config)}-{hashlib.sha256(config.encode()).hexdigest()[:8]}.csv"


def features(extractor, limit: int | None = None) -> pd.DataFrame:
    """Write one participants x features CSV per config, for reading without
    rerunning anything."""
    pids, labels = cohort(limit)
    if PROGRESS:
        print(" ".join(extractor.config().split()))
    df = extractor.frame(pids, progress=PROGRESS)
    df.insert(0, "aware", labels[pids].to_numpy())
    df.index.name = "participant"

    config = extractor.config()
    path = OUTPUT / "features" / _filename(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path)
    print(f"{len(df)} participants x {df.shape[1] - 1} features -> {path.name}")
    return df


def export_calls(extractor, limit: int | None = None) -> pd.DataFrame:
    """Every request this config sends and the reply it gets, for reading by
    hand. Every call is a cache hit once features() has been through, so free"""
    pids, labels = cohort(limit)
    rows, width = [], 0
    for pid in pids:
        with llm.capture() as sent:
            scores = extractor.unit_scores(pid)
        # a unit the participant was silent through is never sent and scores
        # NaN, so the rows that survive name the units the calls were about
        spoken = scores.dropna(how="all").index.tolist()
        for n, call in enumerate(sent):
            messages = call["messages"]
            reply, _ = json.JSONDecoder().raw_decode(call["response"])
            picked = reply.get("categories", [])
            width = max(width, len(picked))
            rows.append(
                {
                    "participant": pid,
                    "aware": labels[pid],
                    # each seed makes one pass over the units, in order
                    "unit": spoken[n % len(spoken)],
                    "seed": call["seed"],
                    **{f"rank_{i + 1}": c for i, c in enumerate(picked)},
                    "reasoning": reply.get("reasoning", ""),
                    "system": next(
                        (m["content"] for m in messages if m["role"] == "system"), ""
                    ),
                    "conversation": "\n\n".join(
                        f"[{m['role']}]\n{m['content']}"
                        for m in messages
                        if m["role"] != "system"
                    ),
                }
            )
    df = pd.DataFrame(rows)
    ranks = [f"rank_{i + 1}" for i in range(width)]
    df = df[
        [
            "participant",
            "aware",
            "unit",
            "seed",
            "system",
            "conversation",
            *ranks,
            "reasoning",
        ]
    ].sort_values(["participant", "unit", "seed"])
    path = OUTPUT / "review" / _filename(calls_config(extractor))
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    print(f"{len(df)} calls -> review/{path.name}")
    return df


def _name(model) -> str:
    """Extractors spell out their whole config: in a sweep every line otherwise
    reads TaxonomyExtractor and there is no telling the runs apart."""
    steps = getattr(model, "steps", None)
    if steps is not None:
        return " + ".join(_name(step) for _, step in steps)
    config = getattr(model, "config", None)
    return " ".join(config().split()) if callable(config) else type(model).__name__  # type: ignore


CV = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=0)


def _class1(fitted, X, y) -> np.ndarray:
    """The fitted model's score for class 1, whichever method it offers."""
    # SVC and friends have no predict_proba unless asked for it
    method = (
        "predict_proba" if hasattr(fitted, "predict_proba") else "decision_function"
    )
    scores = getattr(fitted, method)(X)
    # predict_proba columns follow np.unique(y), decision_function is already 1-D
    return scores[:, list(np.unique(y)).index(1)] if scores.ndim > 1 else scores


def _fold_scores(model, X, y) -> tuple[np.ndarray, np.ndarray]:
    """The auc within each fold, and each participant's mean out-of-fold score.

    Scored inside the fold and averaged, never pooled across folds: a fold that
    chose different features is a different model, and ranking its predictions
    against another fold's measures the split rather than the participant."""
    aucs = []
    total, seen = np.zeros(len(y)), np.zeros(len(y))
    for train, test in CV.split(X, y):
        scores = _class1(clone(model).fit(X[train], y[train]), X[test], y)
        aucs.append(roc_auc_score(y[test], scores))
        total[test] += scores
        seen[test] += 1
    return np.array(aucs), total / seen


def _rough_fit_scores(model, X, y) -> np.ndarray:
    """The same scores in a "training" sample, from a single fit on everything."""
    return _class1(clone(model).fit(X, y), X, y)


def _describe_fit(model, X, y) -> dict[str, str]:
    """Awkward to put this here, but oh well.
    Which blocks a forward selector kept when fitted on everybody, and what
    weight each got. Nothing for non forward selector models.

    The leave-one-out folds each choose their own blocks, so this is the full model,
    not the ones the auc measures."""
    fitted = clone(model).fit(X, y)
    selector = fitted[-1] if hasattr(fitted, "steps") else fitted
    blocks = getattr(selector, "selected_", None)
    if blocks is None:
        return {}
    if not blocks:
        return {"selected": "(none)"}

    described = {"selected": ", ".join(blocks)}
    # nameable only when a block arrived as one column, as under MeanForward
    weights = np.ravel(selector.model_.coef_)
    if len(weights) == len(blocks):
        described["coefficients"] = ", ".join(
            f"{block} {weight:+.3f}" for block, weight in zip(blocks, weights)
        )
    return described


def _metrics(model, X, y) -> dict[str, float]:
    """Overal stats for a given feature extraction"""
    return {
        "auc": float(_fold_scores(model, X, y)[0].mean()),
        "rough_train_auc": float(roc_auc_score(y, _rough_fit_scores(model, X, y))),
    }


def unit_features(extractor, limit: int | None = None) -> pd.DataFrame:
    """Per-unit scores for a chunked segmenter, in the same shape as features()
    but keyed by (participant, unit)

    Written to a subfolder, not used in our models, just for external analyses"""
    pids, labels = cohort(limit)
    rows = [
        {
            "participant": pid,
            "unit": unit,
            "aware": labels[pid],
            **scores,
            "text": " ".join(text.split()),
        }
        for pid in pids
        for (unit, scores), text in zip(
            extractor.unit_scores(pid).iterrows(),
            extractor.segments.split(extractor.scope.select(pid)),
        )
    ]
    df = pd.DataFrame(rows)

    path = OUTPUT / "features" / "per-unit" / _filename(scores_config(extractor))
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    print(f"{len(df)} units x {len(df.columns) - 4} categories -> per-unit/{path.name}")
    return df


_RESULTS: list[dict] = []


def results_table(quiet: bool = False) -> pd.DataFrame:
    """Every evaluate() of the run so far, in one table."""
    df = pd.DataFrame(_RESULTS)
    df.to_csv(OUTPUT / "results.csv", index=False)
    if not quiet:
        print(f"{len(df)} models -> results.csv")
    return df


def _write_predictions(model: str, participants, y, scores, predicted) -> None:
    """What the model made of each participant while it had not seen them: the
    score the auc is read off, and the class it would have called them."""
    path = OUTPUT / "predictions" / _filename(model)
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(
        {
            "participant": participants,
            "aware": y,
            "score": scores,
            "predicted": predicted,
        }
    ).to_csv(path, index=False)


def _write_permutations(model: str, runs: list[dict]) -> None:
    """The null the p-value is read against, one row per run. Permutation 0 is
    the real labels, the rest are shuffled."""
    df = pd.DataFrame(runs)
    path = OUTPUT / "permutations" / _filename(model)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)


def evaluate(model, limit: int | None = None, n_permutations: int = 0, seed: int = 0):
    """Cross-validated auc, with an optional permutation p-value."""
    pids, labels = cohort(limit)
    X = np.array(pids).reshape(-1, 1)
    y = labels[pids].to_numpy()

    observed = _metrics(model, X, y)
    result = {
        "model": _name(model),
        "n": len(y),
        "pos_rate": float(y.mean()),
        **observed,
        **_describe_fit(model, X, y),
        "n_permutations": n_permutations,
    }

    out_of_fold = _fold_scores(model, X, y)[1]
    _write_predictions(
        result["model"], pids, y, out_of_fold, (out_of_fold > 0.5).astype(int)
    )

    if n_permutations:
        rng = np.random.default_rng(seed)
        runs = [{"permutation": 0, **observed}]
        for i in range(n_permutations):
            runs.append(
                {"permutation": i + 1, **_metrics(model, X, rng.permutation(y))}
            )
        null = np.array([r["auc"] for r in runs[1:]])
        # + 1 in formula to prevent zero p-value
        result["p"] = float(
            (np.sum(null >= observed["auc"]) + 1) / (n_permutations + 1)
        )
        _write_permutations(result["model"], runs)

    _RESULTS.append(result)
    # rewritten every time: the run is hours long and _RESULTS is only in memory
    results_table(quiet=True)

    print(
        f"{result['model']}: n={result['n']} pos_rate={result['pos_rate']:.2f} "
        f"auc={result['auc']:.3f} rough_train={result['rough_train_auc']:.3f}"
        + (f" selected=[{result['selected']}]" if "selected" in result else "")
        + (
            f" p={result['p']:.3f} ({n_permutations} permutations)"
            if n_permutations
            else ""
        )
    )
    return result
