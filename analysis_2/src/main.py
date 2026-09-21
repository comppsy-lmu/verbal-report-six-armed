from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import pipeline
from extractors import base
from pipeline import evaluate

pipeline.PROGRESS = True
# MODEL = "phi4-mini:latest"
MODEL = "qwen3.8:27b"
base.WORKERS = 1
EXPORT_CALLS = True

CLASSIFIERS = [
    # DummyClassifier(strategy="uniform"),
    make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced")),
    # make_pipeline(StandardScaler(), SVC(kernel="linear", class_weight="balanced")),
    # LinearDiscriminantAnalysis(solver="lsqr", shrinkage="auto"),
    # GaussianNB(),
    # RandomForestClassifier(
    #   n_estimators=100,
    #   max_depth=3,
    #   min_samples_leaf=5,
    #   random_state=0,
    #   class_weight="balanced",
    # ),
]


# evaluate(make_pipeline(RandomFeatureExtractor(), DummyClassifier(strategy="uniform")))


from extractors.taxonomy.coders import TopK
from extractors.taxonomy.extractor import TaxonomyExtractor
from extractors.taxonomy.levels import Categories, Clusters
from extractors.taxonomy.scopes import Acquisition
from extractors.taxonomy.segments import Groups
from classifiers import GroupForward, MeanForward, by_category, by_half
from pipeline import (
    calls_config,
    scores_config,
    export_calls,
    features,
    results_table,
    unit_features,
)

SWEEP = [
    TaxonomyExtractor(
        Acquisition(),
        Groups(size=6, pooling=pooling),
        TopK(
            k=3,
            n_seeds=5,
            memory=False,
            shuffle="clustered",
            model=MODEL,
            ranking=ranking,
        ),
        level,
    )
    for pooling in ["max", "mean", "none"]
    for ranking in ["flat", "top1", "graded"]
    for level in [Categories(), Clusters(across="max"), Clusters(across="mean")]
]


def forward_models(columns):
    return [
        GroupForward(by_category(columns), name="by-category", criterion="bic"),
        GroupForward(by_half(columns), name="by-half", criterion="bic"),
        MeanForward(by_half(columns), name="by-half-mean", criterion="bic"),
    ]


# The two exports are named by what they hold, not by the whole config, so most
# of the sweep would just rewrite the same file. Write each one once.
exported_scores: set[str] = set()
exported_calls: set[str] = set()

for extractor in SWEEP:
    frame = features(extractor)
    if (key := scores_config(extractor)) not in exported_scores:
        exported_scores.add(key)
        unit_features(extractor)
    if EXPORT_CALLS and (key := calls_config(extractor)) not in exported_calls:
        exported_calls.add(key)
        export_calls(extractor)
    for classifier in CLASSIFIERS:
        evaluate(make_pipeline(extractor, classifier), n_permutations=500)
    # blocks are groups of passages, so there have to be passages left to group.
    # only Groups has a pooling mode at all, and it is the only segmenter whose
    # unit count is the same for every participant, which unpooled features need
    segments = extractor.segments
    if isinstance(segments, Groups) and segments.pooling == "none":
        for selector in forward_models(frame.columns.drop("aware")):
            evaluate(
                make_pipeline(extractor, StandardScaler(), selector),
                n_permutations=500,
            )

results_table()
