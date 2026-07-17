# MediaPipe 모델 (전시용 로컬 배치)

캡처는 이 폴더의 모델을 먼저 찾고, 없으면 CDN 에서 받는다.
전시 셋업에서는 반드시 미리 받아 둔다 — 전시장 인터넷을 신뢰하지 않는다.

```sh
curl -Lo face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
curl -Lo pose_landmarker_lite.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
```
