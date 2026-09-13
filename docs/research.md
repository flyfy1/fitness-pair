# Camera-controlled fitness games: research and choices

Research date: 2026-09-13. Three read-only research agents explored local pose models, temporal action recognition, and exergames. This is a bounded source review, not an exhaustive state-of-the-art ranking or a hardware benchmark. Published accuracy and speed do not establish performance in our browser.

## Deployable pose baselines

| Route | Verified availability | Project fit |
| --- | --- | --- |
| MediaPipe Pose Landmarker / BlazePose GHUM | Official Web API; 33 landmarks; Lite / Full / Heavy; image and estimated 3D coordinates | Current Lite baseline. Compare Full if landmark quality is insufficient and the device has headroom. |
| MoveNet Lightning / Thunder | TensorFlow.js; 17 landmarks; WebGL / WASM; MultiPose tracking | Browser A/B alternative for major joints; lacks MediaPipe's detailed foot landmarks. |
| RTMPose | Released PTH / ONNX weights; multiple landmark configurations and native deployment backends | Compare on identical inputs after demonstrated baseline failures; browser integration still needs adaptation. |
| RTMO | One-stage multi-person pose estimation; CVPR 2024; released ONNX weights | Candidate for simultaneous multiplayer experiments, with no established benefit for the current single-player loop. |

Sources: [MediaPipe Web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [MoveNet](https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/src/movenet/README.md), [RTMPose](https://github.com/open-mmlab/mmpose/blob/main/projects/rtmpose/README.md), [RTMO](https://github.com/open-mmlab/mmpose/blob/main/projects/rtmo/README.md).

MediaPipe's synchronous `detectForVideo()` can block rendering. The integration uses a worker and avoids accumulating frames. Native CPU/GPU results from other projects are not browser measurements, and their benchmark settings are not directly comparable.

MediaPipe code and its linked GHUM model card identify Apache-2.0. TFJS Models and MMPose code also use Apache-2.0; that alone does not confirm the complete terms for every separately distributed checkpoint. The older GHUM model card identifies limitations around head visibility, distance, lighting, occlusion, and precise depth. Do not confuse its single-person description with the current API's configurable pose count. [GHUM model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf), [MMPose model licensing discussion](https://github.com/open-mmlab/mmpose/issues/2106).

## Temporal recognition and repetition counting

Pose estimation locates joints. A completed exercise requires temporal logic; a pose label or a count over a video window is not a timely, deduplicated game event.

| Route | Useful possibility | Evidence or deployment boundary |
| --- | --- | --- |
| Landmarks + state machine | Transparent, training-free completion events | Camera angle and thresholds require human trials. |
| Landmark k-NN endpoints + state machine | Examples can replace increasingly complex thresholds | Needs varied participants and viewpoints; legacy examples need Tasks API adaptation. |
| TCN / ST-GCN skeleton classifier | Distinguish multiple actions and unrelated motion | Requires training data, window-latency evaluation, export, and browser integration. |
| PoseRAC | Learned skeleton-based repetition counting; official weights and inference scripts | Independent comparison candidate; action coverage and input distribution need checking. |
| PAMS, CVPR Findings 2026 | Self-supervised periodic skeleton learning across changing speeds | This review did not confirm an immediately runnable official release; counting benchmarks do not establish real-time control. |
| DeTRC, IJCV 2026 | Dynamic action queries and linear-complexity counting research | Official pipeline includes video features, PyTorch/MMAction2, and compiled operators. |
| CountLLM, CVPR 2025 | Video-and-text-directed counting and generalization | Video encoder plus language model; window counts do not establish low-latency completion events. |

Sources: [Google classification/counting baseline](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/pose_classification.md), [MMAction2](https://github.com/open-mmlab/mmaction2), [PoseRAC](https://github.com/MiracleDance/PoseRAC), [PAMS paper](https://openaccess.thecvf.com/content/CVPR2026F/html/Gao_Count_What_Repeats_Period-Adaptive_Multi-Scale_Consistency_for_Self-Supervised_Repetitive_Action_CVPRF_2026_paper.html), [DeTRC author page](https://shirleymaxx.github.io/DeTRC/), [CountLLM paper](https://openaccess.thecvf.com/content/CVPR2025/papers/Yao_CountLLM_Towards_Generalizable_Repetitive_Action_Counting_via_Large_Language_Model_CVPR_2025_paper.pdf).

These newer papers are research alternatives, not replacements already validated in Fitness Pair. The deployable baseline remains standing calibration, confirmed squat, return to standing, and one stable completion event.

Earlier synthetic feature-sequence review exposed short-occlusion resets and stale calibration after prolonged loss. The migrated baseline addresses bounded short gaps by freezing state, and long gaps by cancelling the action and recalibrating, with regression coverage. This is synthetic evidence; frontal knee projection and switching between visible sides still require human validation.

## Existing games and differentiation

- [Active Arcade](https://docs.nex.inc/products/active-arcade) establishes phone-camera exergames as an existing category; current regional store availability was not verified.
- [Nex Playground tracking](https://support.nexplayground.com/en/articles/13139469-how-does-it-track-my-movements) uses local camera tracking on dedicated hardware. Its [game examples](https://www.nexplayground.com/blog/get-fit-at-home-with-nex-playground) include running, jumping, squat dodges, rhythm, and cooperation.
- [Keep-Ups](https://github.com/collidingScopes/keep-ups/) combines MediaPipe, Three.js, and Rapier for browser keep-ups. Documentation was reviewed; the game was not played in this research.
- [Gamebody](https://github.com/everythingishacked/Gamebody) maps Python/OpenCV/MediaPipe movement recognition to existing game controls. It uses GPL-3.0; this project has not copied its code.

Differentiate through quick browser entry, short rounds, personal calibration, action timing, and satisfying feedback. Do not pitch camera controls as a first invention. Screen readability and camera placement matter; dedicated-device [Nex placement guidance](https://support.nexplayground.com/en/articles/13146545-operating-conditions-player-distance-play-area-device-placement) cannot simply be applied to laptops.

Small studies motivate testing motivation, cognitive load, and feedback, but do not establish long-term health benefits or accurate camera-based fatigue measurement: [2025 monocular exergame study](https://games.jmir.org/2025/1/e75823), [2026 squat-game pilot](https://rehab.jmir.org/2026/1/e81667).

## Next bounded experiments

1. **Timed squat battle:** add an enemy warning, squat dodge, and standing counterattack after validating the existing five-repetition loop. Measure first-success time, agreement between observed actions and game events, and voluntary replay.
2. **March-to-charge:** alternate knee raises to charge and rest to defend. Compare continuous movement with recovery windows; collect preference, false events, perceived fun, and exertion. Do not estimate running speed or calories.
3. **Turn-taking cooperation:** two players alternate at one camera while the other chooses a watering target. Test handoff and shared goals before simultaneous tracking; multiplayer is not implemented merely because the project is called Fitness Pair.

For an algorithm comparison, use the same consented inputs: three participants, front/oblique/side views, slow/natural speed, five repetitions per condition, plus standing, bending, approaching, and occlusion. Keep tuning and validation participants separate. Compare 2D knee angle plus displacement, estimated 3D angle plus image displacement, and example classification plus a state machine.

Report missed counts, false events, p50/p95 event delay, recovery time, and inference time separately. Collect recordings only with participant consent; keep them in ignored local storage and never upload or commit them by default. These are proposed experiments, not completed human trials or measured model comparisons.
