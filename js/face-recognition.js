const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";
export const CONSENT_TEXT = "I understand the camera is used only to capture or recognize faces for attendance, with the consent of the person shown.";
export const MSG = {
  denied: "Camera permission is required for face recognition attendance.",
  nocam: "No camera device was found.",
  noface: "No face detected. Please position the face clearly.",
  multi: "Multiple faces detected. Please ensure the correct people are visible.",
  loading: "Loading face recognition model...",
  fail: "Face could not be recognized. Please try again."
};
let ready = null;
export function loadModels() {
  if (!window.faceapi) return Promise.reject(new Error("Face recognition library failed to load. Check your internet connection."));
  ready = ready || Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]).catch(e => { ready = null; throw e; });
  return ready;
}
export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera is not available (HTTPS is required).");
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
    await video.play();
  } catch (e) {
    console.error(e);
    if (e.name === "NotAllowedError" || e.name === "SecurityError") throw new Error(MSG.denied);
    if (e.name === "NotFoundError" || e.name === "OverconstrainedError") throw new Error(MSG.nocam);
    throw new Error("Could not start camera: " + e.message);
  }
}
export function stopCamera(video) {
  video?.srcObject?.getTracks().forEach(t => t.stop());
  if (video) video.srcObject = null;
}
export const detectAll = video => faceapi.detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 })).withFaceLandmarks().withFaceDescriptors();
export function drawResults(canvas, video, items) {
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const c = canvas.getContext("2d"); c.clearRect(0, 0, canvas.width, canvas.height); c.lineWidth = 3; c.font = "18px sans-serif";
  items.forEach(({ box, label, color }) => { c.strokeStyle = color; c.strokeRect(box.x, box.y, box.width, box.height); c.fillStyle = color; c.fillText(label, box.x, Math.max(18, box.y - 6)); });
}
