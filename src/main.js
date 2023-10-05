import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { extractVertexPositions, getLipIndices } from "./utils.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight); // set window size
renderer.setClearColor(0xffffff); // set background color
document.body.appendChild(renderer.domElement);

camera.position.z = 2; // set camera position
camera.fov = 36; // lower the size becomes larger
camera.updateProjectionMatrix();

const light = new THREE.DirectionalLight(0xffffff, 2.0);
light.position.set(1, 1, 1).normalize();
scene.add(light);

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

let showVertices = true;
let currentObj = null;
let spheres = [];
let boxHelper;
let extendedBoxHelper;
let boxes = [];
const defaultObj = "/netlify/functions/obj/frame0000.obj";

// remove previous lip vertices
function clearPreviousLip() {
  spheres.forEach((sphere) => scene.remove(sphere));
  boxes.forEach((box) => scene.remove(box));
  spheres = [];
  boxes = [];
}

// removes previous OBJ and load new one
function loadObjFile(filePath) {
  if (currentObj) {
    scene.remove(currentObj);
    clearPreviousLip();
  }

  const loader = new OBJLoader();
  loader.load(
    filePath,
    async (object) => {
      scene.add(object); // add new obj to the scene
      currentObj = object; // update the reference to the currently displayed obj

      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const geometry = child.geometry;
          geometry.computeVertexNormals(); // Ensure the vertices are up-to-date
        }
      });
      animate();
      Promise.all([
        extractVertexPositions(filePath),
        getLipIndices("lip_index.txt"),
      ])
        .then(([vertices, lipIndices]) => {
          const min = new THREE.Vector3(Infinity, Infinity, Infinity);
          const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
          lipIndices.forEach((index) => {
            if (index >= 0 && index < vertices.length) {
              const vertex = vertices[index];
              const sphereGeometry = new THREE.SphereGeometry(0.05, 16, 16);
              const sphereMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
              });
              const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
              sphere.position.copy(vertex);

              scene.add(sphere);

              min.min(vertex);
              max.max(vertex);

              spheres.push(sphere);
            } else {
              console.error(`Vertex index ${index} is out of bounds`);
            }
          });
          animate();

          const box = new THREE.Box3(min, max);
          boxHelper = new THREE.Box3Helper(box, 0x33ff45);

          const extendedMin = min.clone().add(new THREE.Vector3(-0.8, -1, 0));
          const extendedMax = max.clone().add(new THREE.Vector3(0.8, 1, 0));
          const extendedBox = new THREE.Box3(extendedMin, extendedMax);
          extendedBoxHelper = new THREE.Box3Helper(extendedBox, 0x33ff45);

          scene.add(boxHelper);
          scene.add(extendedBoxHelper);
          boxes.push(boxHelper);
          boxes.push(extendedBoxHelper);
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

// function to list obj items inside static directory
fetch("/.netlify/functions/list-objs")
  .then((res) => {
    if (!res.ok) {
      return Promise.reject("Failed to fetch");
    }
    return res.json();
  })
  .then((data) => {
    data.files.forEach((file) => {
      const fileItem = document.createElement("div");
      fileItem.textContent = file;
      fileItem.addEventListener("click", () => {
        Array.from(fileList.children).forEach((child) => {
          child.classList.remove("selected");
        });
        fileItem.classList.add("selected");
        loadObjFile(`/netlify/functions/obj/${file}`);
      });

      fileList.appendChild(fileItem);
    });

    const objFileList = document.getElementById("fileList");
    const defaultFileDiv = [...objFileList.children].find(
      (div) => div.textContent === "frame0000.obj"
    );
    if (defaultFileDiv) {
      defaultFileDiv.classList.add("selected");
    } else {
      console.error("Default file not found");
    }
  });

// always load default (initial) obj file
loadObjFile(defaultObj);

document.getElementById("toggleVertices").addEventListener("click", () => {
  showVertices = !showVertices;
  spheres.forEach((sphere) => (sphere.visible = showVertices));
});

document.getElementById("toggleBoundingBox").addEventListener("click", () => {
  const showBoundingBox = boxHelper.visible;
  boxHelper.visible = !showBoundingBox;
  extendedBoxHelper.visible = !showBoundingBox;
});
