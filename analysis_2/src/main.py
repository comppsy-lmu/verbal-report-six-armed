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

# The two exports are named by what they hold, not by the whole config, so most
# of the sweep would just rewrite the same file. Write each one once.
exported_scores: set[str] = set()
exported_calls: set[str] = set()

for extractor in SWEEP:
    features(extractor)
    if (key := scores_config(extractor)) not in exported_scores:
        exported_scores.add(key)
        unit_features(extractor)
    if EXPORT_CALLS and (key := calls_config(extractor)) not in exported_calls:
        exported_calls.add(key)
        export_calls(extractor)
    for classifier in CLASSIFIERS:
        evaluate(make_pipeline(extractor, classifier), n_permutations=500)

results_table()
