import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { ZOOM_RES_L93 } from "./Utils";
import { BufferGeometryUtils } from "three/examples/jsm/utils/BufferGeometryUtils";
import { BoxBufferGeometry, MeshStandardMaterial } from "three";

export const mergedRender = "Merged";
export const singleRender = "Single";

export class VTThreeViewer {
  constructor(
    width,
    height,
    backgroundColor,
    zoomEnabled,
    mapCenter,
    zoomFactor
  ) {
    this.width = width;
    this.height = height;
    this.zoomEnabled = zoomEnabled;
    this.mapCenter = mapCenter;
    this.zoomFactor = zoomFactor;
    this.planes = new THREE.Group();
    this.rayCaster = new THREE.Raycaster();
    this.featuresGroup = new Map();
    this.animate = this.animate.bind(this);
    this.doubleClick = this.doubleClick.bind(this);
    this.initThree(backgroundColor);
    this.addHemisphereLights2();
  }

  initThree(backgroundColor) {
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0px";
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(backgroundColor);

    var depht_s = Math.tan(((45 / 2.0) * Math.PI) / 180.0) * 2.0;
    let z = this.height / depht_s;

    this.orthoCamera = new THREE.OrthographicCamera(
      this.width / -2,
      this.width / 2,
      this.height / 2,
      this.height / -2,
      1,
      1000
    );
    this.orthoCamera.position.set(0, 0, z);

    this.perspectiveCamera = new THREE.PerspectiveCamera(
      45,
      this.width / this.height,
      10,
      1000000
    );
    this.perspectiveCamera.up.set(0, 0, 1);
    this.perspectiveCamera.position.set(0, 0, z);

    this.controls = new OrbitControls(
      this.perspectiveCamera,
      this.renderer.domElement
    );
    if (!this.zoomEnabled) {
      this.controls.enableZoom = false;
    }
    this.controls.maxPolarAngle = Math.PI / 2;
    //this.controls.enabled = false;

    var geometry = new THREE.PlaneBufferGeometry(
      this.width * 2,
      this.height * 2,
      100
    );
    var testmaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      side: THREE.DoubleSide
    });
    var material = new THREE.MeshBasicMaterial({
      transparent: true
      //color: 0xffff00
    });
    var plane = new THREE.Mesh(geometry, material);
    plane.position.set(0, 0, -0.1);

    this.planes.add(plane);
    this.scene.add(this.planes);

    this.currentCamera = this.perspectiveCamera;

    this.renderer.domElement.addEventListener(
      "dblclick",
      this.doubleClick,
      false
    );
    //this.animate();
  }

  animate() {
    this.renderer.render(this.scene, this.currentCamera);
  }

  enableOrbitControls() {
    this.controls.enabled = true;
  }

  disableOrbitControls() {
    this.controls.enabled = false;
  }

  setPlaneTexture(canvas) {
    var texture = new THREE.CanvasTexture(canvas);
    let plane = this.planes.children[0];
    plane.material.map = texture;
    plane.material.map.anisotropy = 0;
    plane.material.map.magFilter = THREE.LinearFilter;
    plane.material.map.minFilter = THREE.LinearFilter;
    plane.material.needsUpdate = true;
  }

  addTestBox(coords, width, height, depth) {
    let x = (coords[0] - this.mapCenter[0]) / this.zoomFactor;
    let y = (coords[1] - this.mapCenter[1]) / this.zoomFactor;
    var geometry = new THREE.BoxBufferGeometry(width, height, depth);
    var material = new THREE.MeshStandardMaterial({ color: 0xff4500 });
    var cube = new THREE.Mesh(geometry, material);
    cube.position.x = x;
    cube.position.y = y;
    cube.position.z = 0;
    this.scene.add(cube);
    return cube;
  }

  //transforms webmercator coords into three "world" coords
  getWorldCoords(coords) {
    let x = (coords[0] - this.mapCenter[0]) / this.zoomFactor;
    let y = (coords[1] - this.mapCenter[1]) / this.zoomFactor;
    return [x, y];
  }

  addFeatures(features, mapCenter, zoomFactor, layer, renderMode) {
    this.mapCenter = mapCenter;
    this.zoomFactor = zoomFactor;
    let material = new THREE.MeshStandardMaterial({
      color: 0xf1ecdb,
      flatShading: true,
      side: THREE.DoubleSide
    });
    var extrudeSettings = {
      steps: 2,
      depth: 1,
      bevelEnabled: false,
      bevelThickness: 1,
      bevelSize: 0,
      bevelOffset: 0,
      bevelSegments: 1
    };
    if (!this.featuresGroup.has(layer)) {
      this.featuresGroup.set(layer, new THREE.Group());
      this.scene.add(this.featuresGroup.get(layer));
    }
    if (renderMode == mergedRender) {
      let geometries = [];
      for (let feature of features) {
        geometries.push(
          this.createGeometryForMergedMesh(
            feature,
            mapCenter,
            zoomFactor,
            extrudeSettings
          )
        );
        // }
      }
      const mergedGeometry = BufferGeometryUtils.mergeBufferGeometries(
        geometries,
        false
      );
      const mesh = new THREE.Mesh(mergedGeometry, material);
      if (mesh != null) {
        this.featuresGroup.get(layer).add(mesh);
      }
    } else if (renderMode == singleRender) {
      for (let feature of features) {
        this.addFeature(feature, layer, mapCenter, zoomFactor);
      }
    }
  }

  createGeometryForMergedMesh(feature, mapCenter, zoomFactor, extrudeSettings) {
    let coords = feature.getGeometry().getCoordinates()[0];
    let points = [];

    for (let coordinate of coords) {
      let x = (coordinate[0] - mapCenter[0]) / zoomFactor;
      let y = (coordinate[1] - mapCenter[1]) / zoomFactor;
      points.push(new THREE.Vector2(x, y));
    }
    let threeShape = new THREE.Shape(points);
    for (let j = 1; j < feature.getGeometry().getCoordinates().length; j++) {
      let holeCoords = [];
      for (let coordinate of feature.getGeometry().getCoordinates()[j]) {
        let x = (coordinate[0] - mapCenter[0]) / zoomFactor;
        let y = (coordinate[1] - mapCenter[1]) / zoomFactor;
        holeCoords.push(new THREE.Vector2(x, y));
      }
      let holeShape = new THREE.Shape(holeCoords);
      threeShape.holes.push(holeShape);
    }

    var shapegeometry = new THREE.ExtrudeBufferGeometry(threeShape, {
      ...extrudeSettings,
      depth:
        feature.getProperties().hauteur != undefined
          ? feature.getProperties().hauteur / zoomFactor
          : 0
    });
    return shapegeometry;
  }

  addFeature(feature, layer, mapCenter, zoomFactor) {
    let material = new THREE.MeshStandardMaterial({
      color: 0xf1ecdb,
      flatShading: true,
      side: THREE.DoubleSide
    });
    var extrudeSettings = {
      steps: 2,
      depth: 1,
      bevelEnabled: false,
      bevelThickness: 1,
      bevelSize: 0,
      bevelOffset: 0,
      bevelSegments: 1
    };
    let coords = feature.getGeometry().getCoordinates()[0];
    let points = [];

    for (let coordinate of coords) {
      let x = (coordinate[0] - mapCenter[0]) / zoomFactor;
      let y = (coordinate[1] - mapCenter[1]) / zoomFactor;
      points.push(new THREE.Vector2(x, y));
    }
    let threeShape = new THREE.Shape(points);
    for (let j = 1; j < feature.getGeometry().getCoordinates().length; j++) {
      let holeCoords = [];
      for (let coordinate of feature.getGeometry().getCoordinates()[j]) {
        let x = (coordinate[0] - mapCenter[0]) / zoomFactor;
        let y = (coordinate[1] - mapCenter[1]) / zoomFactor;
        holeCoords.push(new THREE.Vector2(x, y));
      }
      let holeShape = new THREE.Shape(holeCoords);
      threeShape.holes.push(holeShape);
    }

    var shapegeometry = new THREE.ExtrudeBufferGeometry(
      threeShape,
      extrudeSettings
    );
    shapegeometry.computeBoundingBox();
    var center = new THREE.Vector3();
    shapegeometry.boundingBox.getCenter(center);
    shapegeometry.center();

    shapegeometry.translate(0, 0, 0.5);
    shapegeometry.verticesNeedUpdate = true;
    var mesh = new THREE.Mesh(shapegeometry, material);
    mesh.position.copy(center);
    mesh.scale.set(1, 1, feature.getProperties().hauteur / zoomFactor);
    this.featuresGroup.get(layer).add(mesh);
  }

  addHemisphereLights2() {
    var light = new THREE.HemisphereLight(0xf1ecdb, 0x777788, 1);
    light.position.set(5, 7.5, 10);
    this.scene.add(light);

    var floorGeometry = new THREE.PlaneBufferGeometry(1000, 1000, 10, 10);

    var groundMat = new THREE.MeshLambertMaterial({ color: 0x808080 });
    var floor = new THREE.Mesh(floorGeometry, groundMat);
    floor.position.set(0, 0, 0);
  }

  dist(x1, y1, z1, x2, y2, z2){
    //console.log(Math.sqrt((x1 - x2)**2 + (y1 - y2)**2))
    return Math.sqrt((x1 - x2)**2 + (y1 - y2)**2 + (z1 - z2)**2);
    
  }

  doubleClick(event) {
    let x = (event.clientX / window.innerWidth) * 2 - 1;
    let y = -(event.clientY / window.innerHeight) * 2 + 1;
    let self = this;
    this.rayCaster.setFromCamera(new THREE.Vector2(x, y), this.currentCamera);
    var intersects = this.rayCaster.intersectObjects(this.planes.children);

    //var xShow = intersects[0].point.x * this.zoomFactor + this.mapCenter[0]
    //var yShow = intersects[0].point.y * this.zoomFactor + this.mapCenter[1]

    //AJOUT NATHAN : INTERPOLATION À LA VOLÉE POUR DONNER UNE VALEUR PRÉCISE DE VITESSE DE VENT EN TOUT POINT DE L'ESPACE
    var xLocal = intersects[0].point.x;
    var yLocal = intersects[0].point.y;
    var zLocal = intersects[0].point.z;

    /* debug objects
    var newObj = new THREE.Mesh(new BoxBufferGeometry(20, 20, 20), new MeshStandardMaterial());
    newObj.position.x = xLocal;
    newObj.position.y = yLocal;
    this.scene.add(newObj);*/

    /*for ( let i = 0; i < intersects.length; i ++ ) {

      intersects[ i ].object.material.color.set( 0xff0000 );
  
    }*/

    var lstFrame = [];

    this.scene.children.forEach(function(elem){

      //console.log(elem);
      if (elem.name == "flow"){
        var gap = this.dist(elem.initPosX, elem.initPosY, elem.initPosZ, xLocal, yLocal, zLocal);
        /* debug objects
        var newObj2 = new THREE.Mesh(new BoxBufferGeometry(5, 5, 5), new MeshStandardMaterial());
        newObj2.position.x = elem.initPosX;
        newObj2.position.y = elem.initPosY;
        this.scene.add(newObj2);
        */
        if (lstFrame.length < 4){
          var point = {distance : gap, speedX: elem.speedX, speedY: elem.speedY, speedZ: elem.speedZ, elem: elem};
          lstFrame.push(point);
          lstFrame.sort(function(point1, point2){ //sort DESCENDINGLY the array according to the distance item of the objects within
            return point1.distance > point2.distance ? -1 : 1 //put highest distances at the beginning
          });
        }
        else{
          for (var i = 0; i < 4; i++){
            if (lstFrame[i].distance > gap){ //we found a closer point
              //console.log(i, lstFrame[0].distance, lstFrame[1].distance, lstFrame[2].distance, lstFrame[3].distance, gap);
              //newObj2.material.color.set("green");
              lstFrame[i] = {distance: gap, speedX: elem.speedX, speedY: elem.speedY, speedZ: elem.speedZ, elem : elem}; //replacing the furthest point
              lstFrame.sort(function(point1, point2){ //sorting again the array, each time a closer point is found
                return point1.distance > point2.distance ? -1 : 1;
              });
              
              break; //leaving so as to avoid replacing more than one point
            }
          }
        }
      }
    }.bind(this));

    lstFrame[0].elem.children[0].material.color.set("red");
    lstFrame[1].elem.children[0].material.color.set("red");
    lstFrame[2].elem.children[0].material.color.set("red");
    lstFrame[3].elem.children[0].material.color.set("red");

    var clickSpeedX = (lstFrame[0].distance*lstFrame[0].speedX + 
      lstFrame[1].distance*lstFrame[1].speedX +
      lstFrame[2].distance*lstFrame[2].speedX +
      lstFrame[3].distance*lstFrame[3].speedX) /
      (lstFrame[0].distance + lstFrame[1].distance + lstFrame[2].distance + lstFrame[3].distance);

    var clickSpeedY = (lstFrame[0].distance*lstFrame[0].speedY + 
      lstFrame[1].distance*lstFrame[1].speedY +
      lstFrame[2].distance*lstFrame[2].speedY +
      lstFrame[3].distance*lstFrame[3].speedY) /
      (lstFrame[0].distance + lstFrame[1].distance + lstFrame[2].distance + lstFrame[3].distance);

    var clickSpeedZ = (lstFrame[0].distance*lstFrame[0].speedZ + 
      lstFrame[1].distance*lstFrame[1].speedZ +
      lstFrame[2].distance*lstFrame[2].speedZ +
      lstFrame[3].distance*lstFrame[3].speedZ) /
      (lstFrame[0].distance + lstFrame[1].distance + lstFrame[2].distance + lstFrame[3].distance);

    console.log("Vitesse ponctuelle en X (lon) : ", clickSpeedX,
    "Vitesse ponctuelle en Y (lat) : ",clickSpeedY,
    "Vitesse ponctuelle en Z (h) : ",clickSpeedZ);



  }
}
