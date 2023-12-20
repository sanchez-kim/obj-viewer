import * as THREE from "three";
import { OBJLoader } from "OBJLoader";
import { OrbitControls } from "OrbitControls";

import {
  extractVertexPositions,
  getLipIndices,
  getLipIndicesFromJson,
  handleError,
  addPixelPaddingNoCam,
} from "./utils.js";

const scene = new THREE.Scene();
const canvas = document.getElementById("webgl_canvas");
const aspectRatio = canvas.width / canvas.height;
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  preserveDrawingBuffer: true,
});
renderer.setSize(canvas.width, canvas.height); // set window size
renderer.setClearColor(0xffffff); // set background color

// camera info
let size = 0.6;
let camera = new THREE.OrthographicCamera(-size, size, size, -size, 1, 1000);
camera.position.set(0, 0, 5);
camera.updateProjectionMatrix();

// lighting option
const light = new THREE.DirectionalLight(0xffffff, 2.0);
light.position.set(0, 0, 1);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
scene.add(ambientLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // optional, for inertia during rotation
controls.dampingFactor = 0.05;

controls.screenSpacePanning = false;

controls.minDistance = 100; // minimum zoom distance
controls.maxDistance = 500; // maximum zoom distance

controls.maxPolarAngle = Math.PI / 2; // limit angle of rotation

window.addEventListener("resize", function () {
  const newAspectRatio = canvas.width / canvas.height;
  camera.aspect = newAspectRatio;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.width, canvas.height);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);

  if (captureNextFrame) {
    captureImage();
    captureNextFrame = false;
  }
}

let currentObj = null;
let spheres = [];
let showVertex = true;
let showBox = true;
let boxHelper;
let extendedBoxHelper;
let boxes = [];
let captureNextFrame = false;

// remove previous lip vertices
function clearPreviousLip(spheres, boxes) {
  spheres.forEach((sphere) => scene.remove(sphere));
  boxes.forEach((box) => scene.remove(box));
  spheres = [];
  boxes = [];
}

async function setLibraryFolderAndLoadFiles() {
  const directoryPaths = await window.electronAPI.invoke(
    "open-directory-dialog"
  );
  if (directoryPaths && directoryPaths.length > 0) {
    const selectedDirectory = directoryPaths[0];
    await loadObjFilesFromDirectory(selectedDirectory);
  }
}

function selectFile(fileItem, filePath) {
  const fileList = document.getElementById("fileList");
  Array.from(fileList.children).forEach((child) => {
    child.classList.remove("selected");
  });
  fileItem.classList.add("selected");
  loadTexture(filePath);
}

async function loadObjFilesFromDirectory(directory) {
  try {
    const fullPaths = await window.electronAPI.loadObjFiles(directory);

    const fileList = document.getElementById("fileList");
    fileList.innerHTML = ""; // Clear the previous file list

    fullPaths.forEach((fullPath) => {
      // Extract file name from the full path, for windows
      const fileName = fullPath.split("\\").pop();
      // const fileName = fullPath.split("/").pop();

      const fileItem = document.createElement("div");
      fileItem.textContent = fileName;
      fileItem.addEventListener("click", () => selectFile(fileItem, fullPath));
      fileList.appendChild(fileItem);
    });
  } catch (error) {
    console.error("Error loading OBJ files from directory", error);
  }
}

async function loadTexture(filePath) {
  const textureLoader = new THREE.TextureLoader();

  textureLoader.load(
    "assets/textures/M05.png",
    (textureImage) => {
      loadObjFile(filePath, textureImage);
    },
    undefined,
    (error) => {
      console.error("An error occurred loading the texture", error);
    }
  );
}

// removes previous OBJ and load new one
function loadObjFile(filePath, texture) {
  if (currentObj) {
    scene.remove(currentObj);
    clearPreviousLip(spheres, boxes);

    // Hide the bounding box
    if (boxHelper) boxHelper.visible = false;
    if (extendedBoxHelper) extendedBoxHelper.visible = false;
  }
  const loader = new OBJLoader();

  loader.load(
    filePath,
    (object) => {
      let modelBoundingBox = new THREE.Box3().setFromObject(object);
      let modelSize = modelBoundingBox.getSize(new THREE.Vector3());
      console.log("Model Size: ", modelSize);

      let largestDimension = Math.max(modelSize.x, modelSize.y, modelSize.z);
      console.log("Largest Dimension: ", largestDimension);

      let modelScaleFactor = largestDimension / 1000;
      console.log("Model Scale Factor: ", modelScaleFactor);

      // Get the center of the bounding box
      let center = modelBoundingBox.getCenter(new THREE.Vector3());

      // apply texture to the object
      // object.traverse((child) => {
      //   child.material = new THREE.MeshStandardMaterial({ map: texture });
      // });

      // Translate the object to center it
      object.position.sub(center);

      // Add the object to the scene
      scene.add(object);

      currentObj = object; // update the reference to the currently displayed obj

      animate();

      const jsonPath = filePath.replace(".obj", ".json");

      Promise.all([
        extractVertexPositions(filePath, object.position),
        // getLipIndices("assets/lip/lip_index_old.txt"),
        getLipIndicesFromJson(jsonPath)
          .then((lipIndices) => {
            return lipIndices;
          })
          .catch((error) => {
            handleError(
              error,
              "해당하는 JSON 파일을 찾지못했습니다.\n 파일이 존재하는지 확인하십시오."
            );
            throw error;
          }),
        getLipIndices("./assets/lip/lip_outline_old.txt"),
      ])
        .then(([vertices, lipIndices, outLip]) => {
          // Create a bounding box using the lip outline indices
          const min = new THREE.Vector3(Infinity, Infinity, Infinity);
          const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

          outLip.forEach((index) => {
            if (index >= 0 && index < vertices.length) {
              const vertex = vertices[index];
              min.min(vertex);
              max.max(vertex);
            } else {
              console.error(`Vertex index ${index} is out of bounds`);
            }
          });

          // JSON 파일에서 인덱스 좌표를 불러올 경우 립버텍스 처리 방식
          Object.keys(lipIndices).forEach((key) => {
            const vertexArray = lipIndices[key];
            const vertex = new THREE.Vector3(...vertexArray);
            const sphereGeometry = new THREE.SphereGeometry(0.001, 16, 16); // 립버텍스 점 크기가 넘무 작으면 이것을 조절
            const sphereMaterial = new THREE.MeshBasicMaterial({
              color: 0xff0000, // 점 색깔
            });
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.copy(vertex);
            scene.add(sphere);
            spheres.push(sphere);
          });

          // // txt 파일에서 립버텍스 인덱스만 읽어올 경우 처리 방식
          // lipIndices.forEach((index) => {
          //   if (index) {
          //     if (index >= 0 && index < vertices.length) {
          //       const vertex = vertices[index];
          //       const sphereGeometry = new THREE.SphereGeometry(0.001, 16, 16);
          //       const sphereMaterial = new THREE.MeshBasicMaterial({
          //         color: 0xff0000,
          //       });

          //       const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          //       sphere.position.copy(vertex);
          //       scene.add(sphere);

          //       spheres.push(sphere);
          //     } else {
          //       console.error(`Vertex index ${index} is out of bounds`);
          //     }
          //   }
          // });

          const box = new THREE.Box3(min, max);

          // 바운딩 박스 패딩 설정
          let paddedBox = addPixelPaddingNoCam(
            box.clone(),
            50,
            40,
            100,
            modelScaleFactor
          );

          let paddedBox2 = addPixelPaddingNoCam(
            box.clone(),
            100,
            80,
            100,
            modelScaleFactor
          );

          boxHelper = new THREE.Box3Helper(paddedBox, 0x33ff45);
          extendedBoxHelper = new THREE.Box3Helper(paddedBox2, 0xff33ce);

          scene.add(boxHelper);
          scene.add(extendedBoxHelper);

          boxes.push(boxHelper);
          boxes.push(extendedBoxHelper);

          // // visualize additional sphere to see if padding is working properly
          // const sphereGeometry2 = new THREE.SphereGeometry(0.01, 16, 16);
          // const sphereMaterial2 = new THREE.MeshBasicMaterial({
          //   color: 0x00ff00,
          // });
          // const sphere2 = new THREE.Mesh(sphereGeometry2, sphereMaterial2);
          // const sphere3 = new THREE.Mesh(sphereGeometry2, sphereMaterial2);
          // sphere2.position.add(
          //   new THREE.Vector3(paddedBox.min.x, paddedBox.min.y, paddedBox.min.z)
          // );
          // sphere3.position.add(
          //   new THREE.Vector3(paddedBox.max.x, paddedBox.max.y, paddedBox.max.z)
          // );
          // scene.add(sphere2);
          // scene.add(sphere3);

          // const errorSphere = new THREE.Mesh(sphereGeometry2, sphereMaterial2);
          // errorSphere.position.add(
          //   new THREE.Vector3(-0.04047, 0.01228, 0.21216)
          // );
          // scene.add(errorSphere);

          animate();
        })
        .catch((error) => {
          console.error("An error occurred: ", error);
        });
    },
    (xhr) => {
      // loading progress
      console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
    },
    (error) => {
      console.error("An error occurred", error);
    }
  );
}

function captureImage() {
  var saveCanvas = document.getElementById("webgl_canvas");
  var dataURL = saveCanvas.toDataURL("image/png");

  var tempLink = document.createElement("a");
  tempLink.href = dataURL;
  tempLink.setAttribute("download", "screen.png");
  tempLink.click();
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("selectDirectory")
    .addEventListener("click", setLibraryFolderAndLoadFiles);

  document.getElementById("toggleVertices").addEventListener("click", () => {
    showVertex = !showVertex;
    spheres.forEach((sphere) => (sphere.visible = showVertex));
  });

  document.getElementById("toggleBoundingBox").addEventListener("click", () => {
    showBox = !showBox;
    boxHelper.visible = showBox;
    extendedBoxHelper.visible = showBox;
  });

  document.getElementById("downloadBtn").addEventListener("click", function () {
    captureNextFrame = true;
  });
});
