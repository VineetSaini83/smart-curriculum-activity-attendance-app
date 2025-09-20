// Face Recognition Attendance System

class FaceAttendanceSystem {
    constructor() {
        this.registeredUsers = [];
        this.attendanceRecords = [];
        this.settings = {
            confidenceThreshold: 0.6,
            preventDuplicateAttendance: true,
            videoConstraints: {
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };
        
        this.currentStream = null;
        this.isModelsLoaded = false;
        this.currentSection = 'dashboard';
        this.capturedDescriptors = [];
        this.isRecognitionActive = false;
        
        this.init();
    }

    async init() {
        try {
            await this.loadModels();
            this.setupEventListeners();
            this.updateDashboard();
            this.hideLoading();
            this.showStatus('systemStatus', 'Ready', 'success');
        } catch (error) {
            console.error('Initialization error:', error);
            this.hideLoading();
            this.showStatus('systemStatus', 'Models loading failed', 'error');
            // Still allow basic functionality without face recognition
            this.setupEventListeners();
            this.updateDashboard();
        }
    }

    async loadModels() {
        try {
            // Use a more reliable CDN for face-api.js models
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
            
            // Check if face-api is available
            if (typeof faceapi === 'undefined') {
                throw new Error('Face-api.js library not loaded');
            }

            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
            
            this.isModelsLoaded = true;
            console.log('Face recognition models loaded successfully');
        } catch (error) {
            console.error('Model loading error:', error);
            // Continue without face recognition capabilities
            this.isModelsLoaded = false;
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const section = e.target.dataset.section;
                this.navigateToSection(section);
            });
        });

        // Register section
        document.getElementById('startRegisterCamera').addEventListener('click', () => this.startRegisterCamera());
        document.getElementById('captureImages').addEventListener('click', () => this.captureImages());
        document.getElementById('registerUser').addEventListener('click', () => this.registerUser());

        // Attendance section
        document.getElementById('startAttendanceCamera').addEventListener('click', () => this.startAttendanceCamera());
        document.getElementById('stopAttendanceCamera').addEventListener('click', () => this.stopAttendanceCamera());

        // Records section
        document.getElementById('searchRecords').addEventListener('input', () => this.filterRecords());
        document.getElementById('filterDate').addEventListener('change', () => this.filterRecords());
        document.getElementById('clearFilters').addEventListener('click', () => this.clearRecordFilters());

        // Modal
        document.getElementById('confirmYes').addEventListener('click', () => this.handleConfirmYes());
        document.getElementById('confirmNo').addEventListener('click', () => this.hideModal());
    }

    navigateToSection(section) {
        // Hide all sections
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        
        // Show selected section
        document.getElementById(section).classList.add('active');
        document.querySelector(`[data-section="${section}"]`).classList.add('active');
        
        this.currentSection = section;
        
        // Update content based on section
        if (section === 'dashboard') {
            this.updateDashboard();
        } else if (section === 'records') {
            this.displayRecords();
        } else if (section === 'manage') {
            this.displayUsers();
        }
        
        // Stop any active streams when navigating away
        if (section !== 'register' && section !== 'attendance') {
            this.stopCurrentStream();
        }
    }

    async startRegisterCamera() {
        try {
            // Check if getUserMedia is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera access not supported by this browser');
            }

            this.updateStatus('registerStatus', 'Requesting camera access...', 'info');
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: this.settings.videoConstraints,
                audio: false
            });
            
            const video = document.getElementById('registerVideo');
            video.srcObject = stream;
            this.currentStream = stream;
            
            // Wait for video to be ready
            video.onloadedmetadata = () => {
                video.play().then(() => {
                    document.getElementById('startRegisterCamera').disabled = true;
                    document.getElementById('captureImages').disabled = false;
                    this.updateStatus('registerStatus', 'Camera ready! Position your face in the frame and click "Capture Face Images".', 'success');
                }).catch(error => {
                    console.error('Video play error:', error);
                    this.updateStatus('registerStatus', 'Error starting video playback.', 'error');
                });
            };
            
        } catch (error) {
            console.error('Camera access error:', error);
            let errorMessage = 'Unable to access camera. ';
            
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Camera permission denied. Please allow camera access and try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No camera found on this device.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage += 'Camera not supported by this browser.';
            } else {
                errorMessage += error.message || 'Please check your camera and try again.';
            }
            
            this.updateStatus('registerStatus', errorMessage, 'error');
        }
    }

    async captureImages() {
        if (!this.isModelsLoaded) {
            this.updateStatus('registerStatus', 'Face recognition models not loaded. Cannot capture face data.', 'error');
            return;
        }

        const video = document.getElementById('registerVideo');
        const canvas = document.getElementById('registerCanvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        this.capturedDescriptors = [];
        document.getElementById('captureImages').disabled = true;
        
        this.updateStatus('registerStatus', 'Capturing face images...', 'info');
        this.updateProgress(0, 'Capturing images...');
        
        const totalCaptures = 3;
        
        for (let i = 0; i < totalCaptures; i++) {
            try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                const detections = await faceapi
                    .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceDescriptor();
                
                if (detections) {
                    this.capturedDescriptors.push(Array.from(detections.descriptor));
                    const progress = ((i + 1) / totalCaptures) * 100;
                    this.updateProgress(progress, `Captured ${i + 1}/${totalCaptures} images`);
                    
                    // Draw detection box for feedback
                    const box = detections.detection.box;
                    ctx.strokeStyle = '#32a0ad';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(box.x, box.y, box.width, box.height);
                    
                } else {
                    this.updateStatus('registerStatus', 'No face detected. Please ensure your face is clearly visible and well-lit.', 'error');
                    document.getElementById('captureImages').disabled = false;
                    this.updateProgress(0, 'Ready to capture');
                    return;
                }
                
                await this.delay(1500);
            } catch (error) {
                console.error('Face detection error:', error);
                this.updateStatus('registerStatus', 'Error during face detection. Please try again.', 'error');
                document.getElementById('captureImages').disabled = false;
                this.updateProgress(0, 'Ready to capture');
                return;
            }
        }
        
        if (this.capturedDescriptors.length >= 2) {
            this.updateStatus('registerStatus', 'Face images captured successfully! Enter a name and click "Register User".', 'success');
            document.getElementById('registerUser').disabled = false;
            this.updateProgress(100, 'Ready to register');
        } else {
            this.updateStatus('registerStatus', 'Not enough valid face images captured. Please try again.', 'error');
            document.getElementById('captureImages').disabled = false;
            this.updateProgress(0, 'Ready to capture');
        }
    }

    registerUser() {
        const userName = document.getElementById('userName').value.trim();
        
        if (!userName) {
            this.updateStatus('registerStatus', 'Please enter a valid name.', 'error');
            return;
        }
        
        if (this.capturedDescriptors.length === 0) {
            this.updateStatus('registerStatus', 'Please capture face images first.', 'error');
            return;
        }
        
        // Check if user already exists
        const existingUser = this.registeredUsers.find(user => 
            user.name.toLowerCase() === userName.toLowerCase()
        );
        
        if (existingUser) {
            this.updateStatus('registerStatus', 'A user with this name already exists.', 'error');
            return;
        }
        
        const newUser = {
            id: Date.now(),
            name: userName,
            faceDescriptors: this.capturedDescriptors,
            registrationDate: new Date().toISOString().split('T')[0]
        };
        
        this.registeredUsers.push(newUser);
        
        this.updateStatus('registerStatus', `User "${userName}" registered successfully!`, 'success');
        this.resetRegistrationForm();
        this.updateDashboard();
    }

    resetRegistrationForm() {
        document.getElementById('userName').value = '';
        document.getElementById('startRegisterCamera').disabled = false;
        document.getElementById('captureImages').disabled = true;
        document.getElementById('registerUser').disabled = true;
        this.capturedDescriptors = [];
        this.updateProgress(0, 'Ready to capture');
        this.stopCurrentStream();
        
        // Clear canvas
        const canvas = document.getElementById('registerCanvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    async startAttendanceCamera() {
        try {
            if (!this.isModelsLoaded) {
                this.updateStatus('attendanceStatus', 'Face recognition models not loaded. Please refresh the page.', 'error');
                return;
            }

            if (this.registeredUsers.length === 0) {
                this.updateStatus('attendanceStatus', 'No users registered. Please register users first.', 'error');
                return;
            }

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera access not supported by this browser');
            }

            this.updateStatus('attendanceStatus', 'Starting camera...', 'info');
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: this.settings.videoConstraints,
                audio: false
            });
            
            const video = document.getElementById('attendanceVideo');
            video.srcObject = stream;
            this.currentStream = stream;
            
            video.onloadedmetadata = () => {
                video.play().then(() => {
                    document.getElementById('startAttendanceCamera').disabled = true;
                    document.getElementById('stopAttendanceCamera').disabled = false;
                    
                    this.isRecognitionActive = true;
                    this.updateStatus('attendanceStatus', 'Face recognition active. Looking for registered users...', 'success');
                    
                    // Start recognition loop
                    this.startRecognitionLoop();
                }).catch(error => {
                    console.error('Video play error:', error);
                    this.updateStatus('attendanceStatus', 'Error starting video playback.', 'error');
                });
            };
            
        } catch (error) {
            console.error('Camera access error:', error);
            let errorMessage = 'Unable to access camera. ';
            
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Camera permission denied. Please allow camera access and try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No camera found on this device.';
            } else {
                errorMessage += error.message || 'Please check your camera and try again.';
            }
            
            this.updateStatus('attendanceStatus', errorMessage, 'error');
        }
    }

    stopAttendanceCamera() {
        this.isRecognitionActive = false;
        document.getElementById('startAttendanceCamera').disabled = false;
        document.getElementById('stopAttendanceCamera').disabled = true;
        document.getElementById('lastRecognition').textContent = 'None';
        document.getElementById('confidenceScore').textContent = '-';
        this.updateStatus('attendanceStatus', 'Face recognition stopped.', 'info');
        this.stopCurrentStream();
        
        // Clear canvas
        const canvas = document.getElementById('attendanceCanvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    async startRecognitionLoop() {
        const video = document.getElementById('attendanceVideo');
        const canvas = document.getElementById('attendanceCanvas');
        const ctx = canvas.getContext('2d');
        
        const processFrame = async () => {
            if (!this.isRecognitionActive || !video.videoWidth || video.paused) {
                if (this.isRecognitionActive) {
                    requestAnimationFrame(processFrame);
                }
                return;
            }
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            try {
                const detections = await faceapi
                    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceDescriptors();
                
                if (detections.length > 0) {
                    // Draw face detection boxes
                    ctx.strokeStyle = '#32a0ad';
                    ctx.lineWidth = 3;
                    ctx.fillStyle = '#32a0ad';
                    ctx.font = '16px Arial';
                    
                    for (const detection of detections) {
                        const box = detection.detection.box;
                        ctx.strokeRect(box.x, box.y, box.width, box.height);
                        
                        // Try to recognize the face
                        const recognition = await this.recognizeFace(detection.descriptor);
                        if (recognition) {
                            // Draw name label
                            const labelText = `${recognition.name} (${Math.round(recognition.confidence * 100)}%)`;
                            const textWidth = ctx.measureText(labelText).width;
                            
                            ctx.fillStyle = '#32a0ad';
                            ctx.fillRect(box.x, box.y - 30, textWidth + 10, 30);
                            ctx.fillStyle = 'white';
                            ctx.fillText(labelText, box.x + 5, box.y - 10);
                            
                            this.handleRecognition(recognition);
                        } else {
                            // Unknown face
                            ctx.fillStyle = '#ff5459';
                            ctx.fillRect(box.x, box.y - 30, 80, 30);
                            ctx.fillStyle = 'white';
                            ctx.fillText('Unknown', box.x + 5, box.y - 10);
                        }
                    }
                }
            } catch (error) {
                console.error('Recognition error:', error);
            }
            
            if (this.isRecognitionActive) {
                setTimeout(() => requestAnimationFrame(processFrame), 500);
            }
        };
        
        processFrame();
    }

    async recognizeFace(faceDescriptor) {
        let bestMatch = null;
        let bestDistance = Infinity;
        
        for (const user of this.registeredUsers) {
            for (const storedDescriptor of user.faceDescriptors) {
                const distance = faceapi.euclideanDistance(faceDescriptor, new Float32Array(storedDescriptor));
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = user;
                }
            }
        }
        
        const confidence = Math.max(0, 1 - bestDistance);
        if (confidence >= this.settings.confidenceThreshold) {
            return {
                name: bestMatch.name,
                userId: bestMatch.id,
                confidence: confidence
            };
        }
        
        return null;
    }

    handleRecognition(recognition) {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0];
        
        // Update UI
        document.getElementById('lastRecognition').textContent = recognition.name;
        document.getElementById('confidenceScore').textContent = `${Math.round(recognition.confidence * 100)}%`;
        
        // Check for duplicate attendance
        if (this.settings.preventDuplicateAttendance) {
            const existingRecord = this.attendanceRecords.find(record => 
                record.userId === recognition.userId && record.date === today
            );
            
            if (existingRecord) {
                return; // Don't show message repeatedly
            }
        }
        
        // Mark attendance
        const attendanceRecord = {
            id: Date.now(),
            userId: recognition.userId,
            name: recognition.name,
            date: today,
            time: time
        };
        
        this.attendanceRecords.push(attendanceRecord);
        this.updateStatus('attendanceStatus', `✓ Attendance marked for ${recognition.name}`, 'success');
        this.updateDashboard();
        
        // Auto-clear success message after 3 seconds
        setTimeout(() => {
            if (this.isRecognitionActive) {
                this.updateStatus('attendanceStatus', 'Face recognition active. Looking for registered users...', 'info');
            }
        }, 3000);
    }

    displayRecords() {
        const tbody = document.getElementById('recordsTableBody');
        const emptyState = document.getElementById('recordsEmpty');
        
        if (this.attendanceRecords.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        
        const sortedRecords = [...this.attendanceRecords].sort((a, b) => {
            const dateA = new Date(`${a.date} ${a.time}`);
            const dateB = new Date(`${b.date} ${b.time}`);
            return dateB - dateA;
        });
        
        tbody.innerHTML = sortedRecords.map(record => `
            <tr>
                <td>${record.name}</td>
                <td>${this.formatDate(record.date)}</td>
                <td>${record.time}</td>
            </tr>
        `).join('');
    }

    filterRecords() {
        const searchTerm = document.getElementById('searchRecords').value.toLowerCase();
        const filterDate = document.getElementById('filterDate').value;
        
        let filteredRecords = this.attendanceRecords;
        
        if (searchTerm) {
            filteredRecords = filteredRecords.filter(record =>
                record.name.toLowerCase().includes(searchTerm)
            );
        }
        
        if (filterDate) {
            filteredRecords = filteredRecords.filter(record =>
                record.date === filterDate
            );
        }
        
        const tbody = document.getElementById('recordsTableBody');
        const emptyState = document.getElementById('recordsEmpty');
        
        if (filteredRecords.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            emptyState.textContent = 'No matching records found.';
            return;
        }
        
        emptyState.style.display = 'none';
        
        const sortedRecords = [...filteredRecords].sort((a, b) => {
            const dateA = new Date(`${a.date} ${a.time}`);
            const dateB = new Date(`${b.date} ${b.time}`);
            return dateB - dateA;
        });
        
        tbody.innerHTML = sortedRecords.map(record => `
            <tr>
                <td>${record.name}</td>
                <td>${this.formatDate(record.date)}</td>
                <td>${record.time}</td>
            </tr>
        `).join('');
    }

    clearRecordFilters() {
        document.getElementById('searchRecords').value = '';
        document.getElementById('filterDate').value = '';
        this.displayRecords();
    }

    displayUsers() {
        const tbody = document.getElementById('usersTableBody');
        const emptyState = document.getElementById('usersEmpty');
        
        if (this.registeredUsers.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        
        tbody.innerHTML = this.registeredUsers.map(user => `
            <tr>
                <td>${user.name}</td>
                <td>${this.formatDate(user.registrationDate)}</td>
                <td>
                    <button class="delete-btn" onclick="attendanceSystem.confirmDeleteUser(${user.id})">
                        Delete
                    </button>
                </td>
            </tr>
        `).join('');
    }

    confirmDeleteUser(userId) {
        const user = this.registeredUsers.find(u => u.id === userId);
        if (user) {
            this.pendingDeleteUserId = userId;
            document.getElementById('confirmTitle').textContent = 'Delete User';
            document.getElementById('confirmMessage').textContent = 
                `Are you sure you want to delete user "${user.name}"? This will also remove all their attendance records.`;
            this.showModal();
        }
    }

    handleConfirmYes() {
        if (this.pendingDeleteUserId) {
            this.deleteUser(this.pendingDeleteUserId);
            this.pendingDeleteUserId = null;
        }
        this.hideModal();
    }

    deleteUser(userId) {
        this.registeredUsers = this.registeredUsers.filter(user => user.id !== userId);
        this.attendanceRecords = this.attendanceRecords.filter(record => record.userId !== userId);
        
        this.displayUsers();
        this.updateDashboard();
        
        if (this.currentSection === 'records') {
            this.displayRecords();
        }
    }

    updateDashboard() {
        const today = new Date().toISOString().split('T')[0];
        const todayAttendance = this.attendanceRecords.filter(record => record.date === today).length;
        
        document.getElementById('userCount').textContent = this.registeredUsers.length;
        document.getElementById('todayAttendance').textContent = todayAttendance;
        document.getElementById('totalRecords').textContent = this.attendanceRecords.length;
    }

    updateStatus(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.className = `status-message ${type}`;
    }

    showStatus(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.className = `status status--${type}`;
    }

    updateProgress(percentage, text) {
        document.getElementById('progressFill').style.width = `${percentage}%`;
        document.getElementById('progressText').textContent = text;
    }

    showModal() {
        document.getElementById('confirmModal').classList.remove('hidden');
    }

    hideModal() {
        document.getElementById('confirmModal').classList.add('hidden');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    stopCurrentStream() {
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the application
let attendanceSystem;

document.addEventListener('DOMContentLoaded', () => {
    attendanceSystem = new FaceAttendanceSystem();
});

// Handle page visibility change to manage camera streams
document.addEventListener('visibilitychange', () => {
    if (document.hidden && attendanceSystem) {
        attendanceSystem.stopCurrentStream();
        attendanceSystem.isRecognitionActive = false;
    }
});

// Handle page unload to clean up resources
window.addEventListener('beforeunload', () => {
    if (attendanceSystem) {
        attendanceSystem.stopCurrentStream();
    }
});