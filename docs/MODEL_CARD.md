# SensePath street-furniture condition model card

## Intended use

Version 2.0 estimates the recorded condition of Melbourne outdoor furniture on
a 1-5 scale using asset type and coordinates. SensePath can use the estimate as
one supporting signal when presenting nearby rest/refuge infrastructure.

It must not be described as a live pedestrian-stress, crowd, noise, personal
safety, or clinical prediction. The training dataset contains none of those
targets.

## Model and evaluation

- Algorithm: Random Forest regression, 200 trees, maximum depth 10
- Preprocessing: deployable sklearn Pipeline with unknown-category handling
- Training rows: 3,966
- Holdout MAE: 0.471
- Holdout RMSE: 0.646
- Holdout R2: 0.310
- Mean random 5-fold R2: 0.297
- Mean spatial 5-fold R2: -0.069
- Mean baseline holdout RMSE: 0.778

The model improves on the mean baseline in a random holdout, but its negative
spatial-validation R2 shows weak generalisation to unseen areas. Product UI and
API responses therefore expose training-area warnings and a clear disclaimer.
The machine-readable results are in `data/models/evaluation_report.json`.

## Bias and limitations

- Seats are 3,388 of 3,966 records (85.4%), so results mostly reflect seats.
- Poor-condition records are a small minority.
- Latitude and longitude account for most learned feature importance, which
  helps explain the weak spatial generalisation.
- Council maintenance ratings are not sensory-impact labels.
- No causal claim should be made from these predictions.

## Monitoring and improvement

- Track API latency, validation failures, unknown categories, and locations
  outside the training bounds.
- Re-run random and spatial validation after every data refresh.
- Replace or supplement this model when timestamped pedestrian, noise, event,
  construction, user-preference, and user-validated sensory labels are available.
