// Config settings
const LERP_FACTOR = 0.2; 
const SCALE = 3.0;

// Setup Three.js scene
const canvas = document.querySelector('#output_canvas');
const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x111111);
gridHelper.position.y = -2;
scene.add(gridHelper);

// Add lighting
const light = new THREE.PointLight(0xffffff, 1, 100);
light.position.set(0, 5, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// Setup camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 1, 5);

// Body containers
const bodyJoints = {};
const bodyBones = [];
const targets = {}; 

// Create spherical joint
function createJoint(name, color, size) {
    const geo = new THREE.IcosahedronGeometry(size, 2);
    const mat = new THREE.MeshPhongMaterial({color: color, shininess: 100});
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    bodyJoints[name] = mesh;
    targets[name] = new THREE.Vector3();
}

// Create line bone
function createBodyBone(startJoint, endJoint) {
    const mat = new THREE.LineBasicMaterial({ color: 0xaaaaaa, linewidth: 3 });
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    bodyBones.push({ line, start: startJoint, end: endJoint });
}

// Initialize Mr. Bones body structure
createJoint('nose', 0xff0055, 0.25);
createJoint('lSh', 0x00ffcc, 0.15); createJoint('rSh', 0x00ffcc, 0.15);
createJoint('lEl', 0x0088ff, 0.12); createJoint('rEl', 0x0088ff, 0.12);
createJoint('lWr', 0xffff00, 0.10); createJoint('rWr', 0xffff00, 0.10);
createBodyBone('lSh', 'rSh'); createBodyBone('lSh', 'lEl'); createBodyBone('lEl', 'lWr');
createBodyBone('rSh', 'rEl'); createBodyBone('rEl', 'rWr');

// Hand structures
const handMat = new THREE.LineBasicMaterial({ color: 0xff0055, linewidth: 2 });
function createHandMesh() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(150), 3)); 
    const mesh = new THREE.LineSegments(geo, handMat);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
}

const lHandMesh = createHandMesh();
const rHandMesh = createHandMesh();
const lHandCache = Array(21).fill(0).map(()=>new THREE.Vector3());
const rHandCache = Array(21).fill(0).map(()=>new THREE.Vector3());

// Hand connection map
const handConnections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,5],[0,17]];

// Map MediaPipe to 3D world
function toWorld(lm) {
     return new THREE.Vector3((lm.x - 0.5) * -SCALE, -(lm.y - 0.5) * (SCALE*0.8) + 1.0, -lm.z * SCALE);
}

// Process MediaPipe output
const statusText = document.getElementById('status');
function onResults(results) {
    if (!results.poseLandmarks) {
        statusText.innerText = "Scanning Environment...";
        statusText.style.color = "yellow";
        lHandMesh.visible = false; rHandMesh.visible = false;
        return;
    }
    statusText.innerText = "Tracking Locked";
    statusText.style.color = "#00ff00";

    const pl = results.poseLandmarks;

    // Set targets for LERP smoothing
    function setBodyTarget(name, index) {
        targets[name].copy(toWorld(pl[index]));
    }
    setBodyTarget('nose', 0);
    setBodyTarget('lSh', 11); setBodyTarget('rSh', 12);
    setBodyTarget('lEl', 13); setBodyTarget('rEl', 14);
    setBodyTarget('lWr', 15); setBodyTarget('rWr', 16);

    // Update hands with wrist snap logic
    function updateHand(mesh, landmarks, cacheArr, bodyWristName) {
        if(!landmarks) { mesh.visible = false; return; }
        mesh.visible = true;

        landmarks.forEach((lm, i) => cacheArr[i].lerp(toWorld(lm), LERP_FACTOR));

        const bodyWristPos = bodyJoints[bodyWristName].position; 
        const offset = new THREE.Vector3().subVectors(bodyWristPos, cacheArr[0]);
        
        const pos = mesh.geometry.attributes.position.array;
        let idx = 0;
        handConnections.forEach(pair => {
            const p1 = cacheArr[pair[0]].clone().add(offset);
            const p2 = cacheArr[pair[1]].clone().add(offset);
            pos[idx++] = p1.x; pos[idx++] = p1.y; pos[idx++] = p1.z;
            pos[idx++] = p2.x; pos[idx++] = p2.y; pos[idx++] = p2.z;
        });
        mesh.geometry.setDrawRange(0, handConnections.length * 2);
        mesh.geometry.attributes.position.needsUpdate = true;
    }

    updateHand(lHandMesh, results.leftHandLandmarks, lHandCache, 'lWr');
    updateHand(rHandMesh, results.rightHandLandmarks, rHandCache, 'rWr');
}

// Initialize AI model
const holistic = new Holistic({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`});
holistic.setOptions({
    modelComplexity: 1, smoothLandmarks: true,
    minDetectionConfidence: 0.5, minTrackingConfidence: 0.5
});
holistic.onResults(onResults);

// Start camera feed
const videoElement = document.querySelector('.input_video');
const cameraFeed = new Camera(videoElement, {
    onFrame: async () => { await holistic.send({image: videoElement}); },
    width: 640, height: 480
});
cameraFeed.start();

// Main animation loop
function animate() {
    requestAnimationFrame(animate);

    // Apply smoothing to body joints
    Object.keys(bodyJoints).forEach(key => {
        bodyJoints[key].position.lerp(targets[key], LERP_FACTOR);
    });

    // Update bone lines between joints
    bodyBones.forEach(bone => {
        const pos = bone.line.geometry.attributes.position.array;
        const start = bodyJoints[bone.start].position;
        const end = bodyJoints[bone.end].position;
        pos[0] = start.x; pos[1] = start.y; pos[2] = start.z;
        pos[3] = end.x;   pos[4] = end.y;   pos[5] = end.z;
        bone.line.geometry.attributes.position.needsUpdate = true;
    });

    renderer.render(scene, camera);
}
animate();

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});