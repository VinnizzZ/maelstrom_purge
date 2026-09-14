import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; // Novo: Import do GLTFLoader

// Configuração Base
let camera, scene, renderer, controls;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false;

// Sistema de Colisão
let collidableBoxes = [];

// Estado do Jogo e Armas
let currentWeapon = 1;
let currentLevel = 1;
const weaponsInfo = { 1: "Revólver Overture", 2: "Submetralhadora Pulsar", 3: "Shotgun" };
const levels = { 1: "Totentanz (Boate)", 2: "Depósito da Maelstrom", 3: "Docas de Watson" };

// Dicionário para armazenar as malhas 3D das armas
const weaponModels = {
    1: null,
    2: null,
    3: null
};

// Uniforms para o Shader Customizado
const shaderUniforms = {
    time: { value: 1.0 },
    color1: { value: new THREE.Color(0xff003c) },
    color2: { value: new THREE.Color(0x111111) }
};

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform float time;
    uniform vec3 color1;
    uniform vec3 color2;
    varying vec2 vUv;
    void main() {
        float grid = sin(vUv.y * 50.0 + time * 5.0) * 0.5 + 0.5;
        float pulse = sin(time * 2.0) * 0.5 + 0.5;
        vec3 finalColor = mix(color2, color1, grid * pulse);
        float dist = distance(vUv, vec2(0.5));
        finalColor *= smoothstep(0.8, 0.2, dist);
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

try {
    init();
    animate();
} catch (error) {
    console.error("Crash detectado:", error);
    alert("Erro ao iniciar o jogo: " + error.message);
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.Fog(0x050505, 0, 50);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
    camera.position.y = 10;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Aumentei um pouco para iluminar as armas
    scene.add(ambientLight);
    const neonLight = new THREE.PointLight(0xff003c, 1000, 100);
    neonLight.position.set(0, 20, 0);
    scene.add(neonLight);

    controls = new PointerLockControls(camera, document.body);
    scene.add(camera); // Essencial para que elementos fixados na câmera sejam renderizados

    const blocker = document.getElementById('blocker');
    const hud = document.getElementById('hud');

    blocker.addEventListener('click', () => controls.lock());
    controls.addEventListener('lock', () => {
        blocker.style.display = 'none';
        hud.style.display = 'block';
    });
    controls.addEventListener('unlock', () => {
        blocker.style.display = 'flex';
        hud.style.display = 'none';
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseClick);

    // Carrega os Modelos 3D das armas
    loadWeapons();

    // Carrega o cenário
    loadLevel(currentLevel);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    window.addEventListener('resize', onWindowResize);
}

function loadWeapons() {
    const gltfLoader = new GLTFLoader();

    // Função auxiliar para carregar, posicionar e esconder a arma
    const loadWeaponModel = (id, filename, position, scale = 1, rotateY = 0) => {
        gltfLoader.load(`/${filename}`, (gltf) => {
            const model = gltf.scene;

            // Posiciona a arma relativa à câmera (X: direita/esquerda, Y: cima/baixo, Z: frente/trás)
            model.position.set(position.x, position.y, position.z);
            model.scale.set(scale, scale, scale);
            model.rotation.y = rotateY;

            // Fixa o modelo diretamente na câmera
            camera.add(model);

            weaponModels[id] = model;

            // Só deixa visível se for a arma atual
            model.visible = (currentWeapon === id);
        }, undefined, (error) => {
            console.warn(`Aviso: Não foi possível carregar ${filename}. O jogo continuará sem o modelo.`);
        });
    };

    // Os modelos GLB já apontam para a frente (-Z). Rotação Y = 0 mantém a arma apontando para o alvo.
    loadWeaponModel(1, 'revolver.glb', { x: 0.26, y: -0.24, z: -0.5 }, 1.1, 0);
    loadWeaponModel(2, 'smg.glb', { x: 0.28, y: -0.25, z: -0.55 }, 1.1, 0);
    loadWeaponModel(3, 'shotgun.glb', { x: 0.28, y: -0.25, z: -0.55 }, 1.1, 0);
}

function loadLevel(levelId) {
    const childrenToRemove = scene.children.filter(child => child.type === "Mesh" || (child.type === "Group" && child !== camera));
    childrenToRemove.forEach(child => scene.remove(child));

    collidableBoxes = [];

    document.getElementById('level-info').innerText = `Fase ${levelId}: ${levels[levelId]}`;

    const customMaterial = new THREE.ShaderMaterial({
        uniforms: shaderUniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        side: THREE.DoubleSide
    });

    const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x333333, specular: 0x888888, shininess: 30 });
    const floorGeo = new THREE.PlaneGeometry(200, 200, 10, 10);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorMaterial);
    scene.add(floor);

    const boxGeo = new THREE.BoxGeometry(20, 40, 20);

    const centralBox = new THREE.Mesh(boxGeo, customMaterial);
    centralBox.position.set(0, 20, -30);
    scene.add(centralBox);
    collidableBoxes.push(new THREE.Box3().setFromObject(centralBox));

    const numBoxes = levelId === 1 ? 20 : (levelId === 2 ? 40 : 15);
    const generatedPositions = [];
    const minDistance = 25;

    for (let i = 0; i < numBoxes; i++) {
        let x, z;
        let validPosition = false;
        let attempts = 0;

        while (!validPosition && attempts < 50) {
            x = Math.floor(Math.random() * 20 - 10) * 10;
            z = Math.floor(Math.random() * 20 - 10) * 10;
            validPosition = true;

            if ((Math.abs(x) <= 20 && Math.abs(z) <= 20) || (Math.abs(x) <= 10 && Math.abs(z + 30) <= 10)) {
                validPosition = false;
            } else {
                for (let pos of generatedPositions) {
                    const dx = x - pos.x;
                    const dz = z - pos.z;
                    if (Math.sqrt(dx * dx + dz * dz) < minDistance) {
                        validPosition = false;
                        break;
                    }
                }
            }
            attempts++;
        }

        if (validPosition) {
            generatedPositions.push({ x, z });
            const box = new THREE.Mesh(boxGeo, customMaterial);
            box.position.set(x, 20, z);
            scene.add(box);

            const bbox = new THREE.Box3().setFromObject(box);
            collidableBoxes.push(bbox);
        }
    }
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump) velocity.y += 350; canJump = false; break;
        case 'Digit1': switchWeapon(1); break;
        case 'Digit2': switchWeapon(2); break;
        case 'Digit3': switchWeapon(3); break;
        case 'KeyL':
            currentLevel = currentLevel === 3 ? 1 : currentLevel + 1;
            loadLevel(currentLevel);
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

function switchWeapon(id) {
    currentWeapon = id;
    document.getElementById('weapon-info').innerText = `Arma: ${weaponsInfo[id]}`;

    // Atualiza a visibilidade dos modelos 3D
    for (let wId in weaponModels) {
        if (weaponModels[wId]) {
            weaponModels[wId].visible = (parseInt(wId) === currentWeapon);
        }
    }
}

function onMouseClick() {
    if (!controls.isLocked) return;

    // Animação super rápida de recuo (recoil) na arma atual
    const currentModel = weaponModels[currentWeapon];
    if (currentModel) {
        currentModel.position.z += 0.2; // Empurra a arma pra trás
        setTimeout(() => currentModel.position.z -= 0.2, 50); // Volta ao normal
    }

    // Efeito de iluminação
    scene.children.forEach(child => {
        if (child.isPointLight && child.color.getHex() === 0xff003c) {
            child.color.setHex(0xffffff);
            setTimeout(() => child.color.setHex(0xff003c), 50);
        }
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    shaderUniforms.time.value += delta;

    if (controls.isLocked === true) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const speed = 400.0;
        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        const oldX = camera.position.x;
        const oldZ = camera.position.z;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        camera.position.y += (velocity.y * delta);

        const playerBox = new THREE.Box3();
        const playerRadius = 2.5;
        playerBox.min.set(camera.position.x - playerRadius, 0, camera.position.z - playerRadius);
        playerBox.max.set(camera.position.x + playerRadius, 20, camera.position.z + playerRadius);

        let isColliding = false;
        for (let i = 0; i < collidableBoxes.length; i++) {
            if (playerBox.intersectsBox(collidableBoxes[i])) {
                isColliding = true;
                break;
            }
        }

        if (isColliding) {
            camera.position.x = oldX;
            camera.position.z = oldZ;
            velocity.x = 0;
            velocity.z = 0;
        }

        if (camera.position.y < 10) {
            velocity.y = 0;
            camera.position.y = 10;
            canJump = true;
        }
    }

    prevTime = time;
    renderer.render(scene, camera);
}