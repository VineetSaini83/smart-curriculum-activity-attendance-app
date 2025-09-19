const AppState = {
  LOADING_MODELS: 'LOADING_MODELS',
  IDLE: 'IDLE',
  REGISTERING: 'REGISTERING',
  MARKING_ATTENDANCE: 'MARKING_ATTENDANCE',
};

// Icon components (simplified for direct HTML insertion)
const CameraIcon = (className = "w-6 h-6") => `
  <svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
`;

const UserAddIcon = (className = "w-6 h-6") => `
  <svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
  </svg>
`;

const CheckCircleIcon = (className = "w-6 h-6") => `
  <svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
`;

const TrashIcon = (className = "w-6 h-6") => `
    <svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
`;

const DownloadIcon = (className = "w-6 h-6") => `
    <svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
`;

let appState = AppState.LOADING_MODELS;
let registeredUsers = [];
let attendanceLog = [];
let newUserName = '';
let feedback = null;
let lastDetection = new Map();

const videoRef = document.createElement('video');
const canvasRef = document.createElement('canvas');
let recognitionInterval = null;

const rootElement = document.getElementById('root');

const showFeedback = (message, type = 'success', duration = 3000) => {
  feedback = { message, type };
  render();
  setTimeout(() => {
    feedback = null;
    render();
  }, duration);
};

const loadModels = async () => {
  const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    appState = AppState.IDLE;
    render();
  } catch (error) {
    console.error("Failed to load models:", error);
    showFeedback("Failed to load recognition models. Please refresh.", "error", 5000);
  }
};

const startWebcam = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    videoRef.srcObject = stream;
    videoRef.play();
  } catch (err) {
    console.error("Error accessing webcam:", err);
    showFeedback("Could not access webcam. Please check permissions.", "error");
    appState = AppState.IDLE;
    render();
  }
};

const stopWebcam = () => {
  if (videoRef.srcObject) {
    const stream = videoRef.srcObject;
    stream.getTracks().forEach(track => track.stop());
    videoRef.srcObject = null;
  }
};

const stopRecognition = () => {
  if (recognitionInterval) {
    clearInterval(recognitionInterval);
    recognitionInterval = null;
  }
  const context = canvasRef.getContext('2d');
  context?.clearRect(0, 0, canvasRef.width, canvasRef.height);
};

const handleRegisterClick = () => {
  appState = AppState.REGISTERING;
  startWebcam();
  render();
};

const handleCaptureAndSave = async () => {
  if (!newUserName.trim()) {
    showFeedback("Please enter a name.", "error");
    return;
  }
  if (registeredUsers.some(user => user.name.toLowerCase() === newUserName.trim().toLowerCase())) {
    showFeedback("A user with this name already exists.", "error");
    return;
  }
  if (videoRef) {
    const detection = await faceapi
      .detectSingleFace(videoRef, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) {
      const newUser = {
        name: newUserName.trim(),
        descriptor: Array.from(detection.descriptor),
      };
      registeredUsers = [...registeredUsers, newUser].sort((a, b) => a.name.localeCompare(b.name));
      localStorage.setItem('registeredUsers', JSON.stringify(registeredUsers));
      showFeedback(`${newUserName.trim()} registered successfully!`, 'success');
      newUserName = '';
      stopWebcam();
      appState = AppState.IDLE;
      render();
    } else {
      showFeedback("No face detected. Please position yourself in front of the camera.", "error");
    }
  }
};

const startRecognition = async () => {
  if (!videoRef || !canvasRef || registeredUsers.length === 0) {
    if (registeredUsers.length === 0) {
      showFeedback("No users registered. Please register a user first.", "error");
      appState = AppState.IDLE;
      render();
    }
    return;
  }

  const video = videoRef;
  const canvas = canvasRef;
  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  const faceMatcher = new faceapi.FaceMatcher(registeredUsers.map(u =>
    new faceapi.LabeledFaceDescriptors(u.name, [new Float32Array(u.descriptor)])
  ));

  recognitionInterval = setInterval(async () => {
    if (!video.srcObject) return;
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    const context = canvas.getContext('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);

    resizedDetections.forEach(detection => {
      const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
      const box = detection.detection.box;
      const drawBox = new faceapi.draw.DrawBox(box, {
        label: bestMatch.toString(),
        boxColor: bestMatch.label === 'unknown' ? 'red' : 'limegreen'
      });
      drawBox.draw(canvas);

      if (bestMatch.label !== 'unknown') {
        const now = Date.now();
        const lastSeen = lastDetection.get(bestMatch.label) || 0;

        if (now - lastSeen > 10000) { // 10 second cooldown
          const today = new Date().toLocaleDateString();
          const alreadyLoggedToday = attendanceLog.some(
            record => record.name === bestMatch.label && new Date(record.timestamp).toLocaleDateString() === today
          );

          if (!alreadyLoggedToday) {
            const newRecord = {
              name: bestMatch.label,
              timestamp: new Date().toISOString(),
            };
            attendanceLog = [newRecord, ...attendanceLog];
            localStorage.setItem('attendanceLog', JSON.stringify(attendanceLog));
            showFeedback(`Attendance marked for ${bestMatch.label}`, 'success');
            render(); // Re-render to update attendance log
          }
          lastDetection.set(bestMatch.label, now);
        }
      }
    });
  }, 500);
};

const handleMarkAttendanceClick = () => {
  appState = AppState.MARKING_ATTENDANCE;
  startWebcam();
  render();
};

const handleCancel = () => {
  stopWebcam();
  stopRecognition();
  newUserName = '';
  appState = AppState.IDLE;
  render();
};

const handleDeleteUser = (userName) => {
  registeredUsers = registeredUsers.filter(user => user.name !== userName);
  localStorage.setItem('registeredUsers', JSON.stringify(registeredUsers));
  showFeedback(`${userName} has been removed.`, 'success');
  render();
};

const handleDownloadCSV = () => {
  if (attendanceLog.length === 0) {
    showFeedback("No attendance records to download.", "error");
    return;
  }

  let link = null;
  try {
    const csvHeader = "Name,Date,Time\n";
    const csvRows = attendanceLog.map(log => {
      const date = new Date(log.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();
      return `"${log.name}","${dateStr}","${timeStr}"`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "attendance_log.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(url);
    showFeedback("Log downloaded successfully.", "success");
  } catch (error) {
    console.error("Failed to download CSV:", error);
    showFeedback("An error occurred while downloading the log.", "error");
  } finally {
    if (link) {
      document.body.removeChild(link);
    }
  }
};

const renderContent = () => {
  switch (appState) {
    case AppState.LOADING_MODELS:
      return `
        <div class="flex flex-col items-center justify-center h-full">
          <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
          <p class="mt-4 text-lg">Loading Recognition Models...</p>
        </div>
      `;

    case AppState.REGISTERING:
      return `
        <div class="flex flex-col items-center w-full max-w-2xl">
          <h2 class="text-2xl font-bold mb-4">Register New User</h2>
          <div class="relative w-full aspect-video bg-gray-800 rounded-lg overflow-hidden border-2 border-gray-700 mb-4">
            ${videoRef.outerHTML}
          </div>
          <input
            type="text"
            value="${newUserName}"
            oninput="newUserName = this.value; render();"
            placeholder="Enter Name"
            class="w-full px-4 py-2 mb-4 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="New user name"
          />
          <div class="flex space-x-4">
            <button onclick="handleCaptureAndSave()" class="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold flex items-center space-x-2 transition-colors">
              ${CameraIcon()}
              <span>Capture and Save</span>
            </button>
            <button onclick="handleCancel()" class="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-colors">
              Cancel
            </button>
          </div>
        </div>
      `;

    case AppState.MARKING_ATTENDANCE:
      // Ensure video and canvas are correctly positioned and sized
      videoRef.style.width = '100%';
      videoRef.style.height = '100%';
      videoRef.style.objectFit = 'cover';
      canvasRef.style.position = 'absolute';
      canvasRef.style.top = '0';
      canvasRef.style.left = '0';
      canvasRef.style.width = '100%';
      canvasRef.style.height = '100%';

      // Attach onPlay event listener directly to the video element
      videoRef.onplay = startRecognition;

      return `
        <div class="flex flex-col items-center w-full max-w-4xl">
          <h2 class="text-2xl font-bold mb-4">Marking Attendance</h2>
          <p class="mb-4 text-gray-400">Recognized users will have their attendance marked automatically.</p>
          <div class="relative w-full aspect-video bg-gray-800 rounded-lg overflow-hidden border-2 border-gray-700">
             ${videoRef.outerHTML}
             ${canvasRef.outerHTML}
          </div>
          <button onclick="handleCancel()" class="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors">
            Stop
          </button>
        </div>
      `;

    case AppState.IDLE:
    default:
      return `
        <div class="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- Left Column: Actions and Registered Users -->
          <div class="flex flex-col space-y-8">
            <div class="bg-gray-800 p-6 rounded-lg shadow-lg">
              <h2 class="text-xl font-bold mb-4">Actions</h2>
              <div class="flex flex-col sm:flex-row gap-4">
                   <button onclick="handleRegisterClick()" class="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors">
                      ${UserAddIcon()}
                      <span>Register New User</span>
                  </button>
                   <button onclick="handleMarkAttendanceClick()" class="w-full px-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors">
                      ${CheckCircleIcon()}
                      <span>Mark Attendance</span>
                  </button>
              </div>
            </div>

            <div class="bg-gray-800 p-6 rounded-lg shadow-lg">
              <h2 class="text-xl font-bold mb-4">Registered Users (${registeredUsers.length})</h2>
              <div class="max-h-80 overflow-y-auto pr-2">
                  ${registeredUsers.length > 0 ? `
                      <ul class="space-y-2">
                          ${registeredUsers.map(user => `
                              <li key="${user.name}" class="flex justify-between items-center bg-gray-700 p-3 rounded-md">
                                  <span class="font-medium">${user.name}</span>
                                  <button onclick="handleDeleteUser('${user.name}')" class="text-red-400 hover:text-red-500 transition-colors" aria-label="Delete ${user.name}">
                                      ${TrashIcon()}
                                  </button>
                              </li>
                          `).join('')}
                      </ul>
                  ` : `
                      <p class="text-gray-400">No users registered yet.</p>
                  `}
              </div>
            </div>
          </div>

          <!-- Right Column: Attendance Log -->
          <div class="bg-gray-800 p-6 rounded-lg shadow-lg">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-xl font-bold">Attendance Log (${attendanceLog.length})</h2>
              <button onclick="handleDownloadCSV()" class="text-blue-400 hover:text-blue-500 transition-colors flex items-center space-x-1" ${attendanceLog.length === 0 ? 'disabled' : ''}>
                  ${DownloadIcon("w-5 h-5")}
                  <span>Export CSV</span>
              </button>
            </div>
            <div class="max-h-[30rem] overflow-y-auto pr-2">
                ${attendanceLog.length > 0 ? `
                    <table class="w-full text-left">
                        <thead class="sticky top-0 bg-gray-800">
                            <tr>
                                <th class="p-2">Name</th>
                                <th class="p-2">Date</th>
                                <th class="p-2">Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${attendanceLog.map((record, index) => `
                                <tr key="${index}" class="border-t border-gray-700">
                                    <td class="p-2 font-medium">${record.name}</td>
                                    <td class="p-2 text-gray-300">${new Date(record.timestamp).toLocaleDateString()}</td>
                                    <td class="p-2 text-gray-300">${new Date(record.timestamp).toLocaleTimeString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : `
                    <p class="text-gray-400 text-center py-8">No attendance records yet.</p>
                `}
            </div>
          </div>
        </div>
      `;
  }
};

const render = () => {
  rootElement.innerHTML = `
    <div class="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 sm:p-6 md:p-8 font-sans">
      <header class="mb-8 text-center">
        <h1 class="text-4xl font-bold text-blue-400">Face Recognition Attendance System</h1>
        <p class="text-gray-400 mt-2">Real-time attendance tracking using your webcam.</p>
      </header>

      ${feedback ? `
        <div
            class="fixed top-5 right-5 px-6 py-3 rounded-lg shadow-lg text-white font-semibold animate-fade-in-out ${feedback.type === 'success' ? 'bg-green-600' : 'bg-red-600'}"
            role="alert"
        >
            ${feedback.message}
        </div>
      ` : ''}

      <main class="w-full flex justify-center">
        ${renderContent()}
      </main>
    </div>
  `;

  // Re-attach video and canvas elements if they were part of the content
  if (appState === AppState.REGISTERING || appState === AppState.MARKING_ATTENDANCE) {
    const videoContainer = rootElement.querySelector('.relative.w-full.aspect-video');
    if (videoContainer) {
      const existingVideo = videoContainer.querySelector('video');
      const existingCanvas = videoContainer.querySelector('canvas');

      if (existingVideo) existingVideo.remove();
      if (existingCanvas) existingCanvas.remove();

      videoContainer.prepend(videoRef);
      if (appState === AppState.MARKING_ATTENDANCE) {
        videoContainer.appendChild(canvasRef);
      }
    }
  }
};

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  const storedUsers = localStorage.getItem('registeredUsers');
  const storedLog = localStorage.getItem('attendanceLog');
  if (storedUsers) registeredUsers = JSON.parse(storedUsers);
  if (storedLog) attendanceLog = JSON.parse(storedLog);

  videoRef.autoplay = true;
  videoRef.playsInline = true;
  videoRef.muted = true;
  videoRef.className = "w-full h-full object-cover";

  loadModels();
});