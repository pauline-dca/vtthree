import "regenerator-runtime/runtime";
import * as THREE from "three";
import Feature from "ol/Feature";
import { VTController } from "./VTController";
import { mergedRender, singleRender } from "./VTThreeViewer";
import { planStyle, grisStyle, muetStyle } from "./OLViewer";
import proj4 from "proj4";
import { proj4326, proj3857 } from "./Utils";
import { Flow } from "three/examples/jsm/modifiers/CurveModifier.js";

//data can be imported like this or read from the data folder
import windData from "../../data/wind.json";
import { abstract } from "ol/util";
import { Matrix4, SphereBufferGeometry } from "three";
import { extendRings } from "ol/extent";
import * as dat from 'dat.gui';


const width = window.innerWidth; // this makes the 3D canvas full screen
const height = window.innerHeight; // this makes the 3D canvas full screen

let vavinLatLon = [48.8441416, 2.3288795];
let vavinCenter = proj4(proj4326, proj3857, [vavinLatLon[1], vavinLatLon[0]]);

let baseSpeed = 0.2;
let withFlowLine = false;

const paramsWind = {
  center: vavinCenter,
  zoom: 18,
  layers: ["bati_surf", "bati_zai"],
  //layers : [],
  style: muetStyle,
  tileZoom: false
};

let params = paramsWind;
let controller = null;
async function init() {

  controller = new VTController(
    width,
    height,
    params.center, //center coordinates in webmercator
    params.zoom, //zoom level
    params.layers, //layers to be rendered as 3D features
    mergedRender, //render type, merged render more efficient but does not provide access to each feature
    params.style, //style for the tiles
    params.tileZoom,
    withFlowLine,
    baseSpeed,
  );

  var flowLine = addObjects();
  controller.flowLine = flowLine;
}

function addObjects() {

  // GUI AND PARAMS SETTING
  var gui = new dat.GUI({name: "First GUI", hideable: true});
  var menuMesh = gui.addFolder("Mesh");
  //gui.addFolder("Speed");
  //gui.addFolder("Camera");
  //gui.addFolder("Direction");
  //gui.addFolder("Environment");
  /*gui.add(newObj2.position, "x", 0, 100).onChange(function(newValue){
    console.log("New value : ", newValue);
  });*/

  var paramsGUI = {tailleMesh : 3,
              couleurMesh : "#000000",
              typeMesh : "cylinder",
              geomFlux : "mesh",
              nbFlux : 10,
              speedFlux : 0.2,
              opaciteFlux : 1,
              newPosFlux : 0,
              contFlux : null};

  //gui.remember(params);
  var changeTaille = menuMesh.add(paramsGUI, "tailleMesh", 1, 10, 0.5).name("Taille")//.listen();
  changeTaille.onChange(function(value){
    controller.threeViewer.scene.traverse(function(obj){
      var mat = new Matrix4().makeScale(1, value, 1)
      if (obj.name == "flow"){
        obj.applyMatrix4(mat);
      }
    })
  });

  var changeSpeed = menuMesh.add(paramsGUI, "speedFlux", 0, 1, 0.01).name("Vitesse")//.listen();
  changeSpeed.onChange(function(value){
    controller.baseSpeed = value;
  });

  var changeCouleur = menuMesh.addColor(paramsGUI, "couleurMesh").name("Couleur");
  changeCouleur.onChange(function(value){
    controller.threeViewer.scene.traverse(function(obj){
      if (obj.name == "flow"){
        obj.children[0].material.color.set(value);
      }
    })
  });

  
  
  windData.forEach(function(point){
    
    //Initial buffer geometries

    var flowWidthTop = 0.2;
    var flowWidthBottom = 0.01;

    var p = new THREE.CylinderBufferGeometry(flowWidthTop, flowWidthBottom);

    // Some main parameters for the flows, to be modified depending on the context...
    var coef = 3;
    var flowSize = coef*Math.sqrt(point.u**2 + point.v**2 + point.w**2);
    var m = new THREE.MeshStandardMaterial({color : "black", opacity: 1, transparent: true});
    var mesh = new THREE.Mesh(p, m);
    mesh.rotateOnWorldAxis(new THREE.Vector3(1,0,0), Math.atan(point.w/flowSize)); //rotation X (direction haut bas)

    //Rotation handling :
    
    if (point.u >= 0){ //vitesse en longitude, selon les x
      if (point.v >= 0){ //vitesse en latitude, selon les y
        //quart haut droit du cercle trigo, si l'on place les x au nord, car l'orientation de base des meshs est dirigée vers les y
        mesh.applyMatrix4(new Matrix4().makeScale(1, flowSize, 1));
        mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), - Math.atan(point.u/point.v)); //rotation selon Z (direction lat lon)
      }
      else{
        //quart bas droit
        mesh.material.color.set("red");
        mesh.applyMatrix4(new Matrix4().makeScale(1, flowSize, 1));
        mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), - Math.atan(point.u/point.v) - Math.PI);
      }
    }
    else{
      if (point.v >= 0){
        //quart haut gauche
        mesh.material.color.set("green");
        mesh.applyMatrix4(new Matrix4().makeScale(1, flowSize, 1));
        mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), Math.atan(point.v/point.u) + Math.PI/2);
      }
      else{
        //quart bas gauche
        mesh.material.color.set("blue");
        mesh.applyMatrix4(new Matrix4().makeScale(1, flowSize, 1));
        mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), Math.PI/2 + Math.atan(point.v/point.u));
      }
    }

    //Postionning the objects
    var cooWebMerca = proj4(proj4326, proj3857, [point.lon, point.lat]);
    var goodCoords = controller.threeViewer.getWorldCoords(cooWebMerca);

    var flow = new THREE.Group();
    flow.add(mesh);
    flow.name = "flow";
    flow.initPosX = goodCoords[0];
    flow.initPosY = goodCoords[1];
    flow.initPosZ = point.z
    flow.position.x = goodCoords[0];
    flow.position.y = goodCoords[1];
    flow.position.z = point.z
    flow.speedX = point.u;
    flow.speedY = point.v;
    flow.speedZ = point.w;
    flow.size = flowSize;

    controller.threeViewer.scene.add(flow);
/*
    var quaternion = new THREE.Quaternion();
    mesh.getWorldQuaternion(quaternion);
    var euler_rot = new THREE.Euler().setFromQuaternion(quaternion);
    console.log(euler_rot);*/
    //console.log(mesh.scale);

    


  }); 

  //TESTS WITH CURVES
  /*

  const curveHandles = [];

  var lstCurve = [
    { x: 50, y: -800, z: 120 },
    { x: 0, y: 0, z: 120 },
    { x: -200, y: 200, z: 120 },
  ];

  

  const boxGeometry = new THREE.BoxBufferGeometry( 0.1, 0.1, 0.1 );
  const boxMaterial = new THREE.MeshBasicMaterial();

  for ( const handlePos of lstCurve ) {

    const handle = new THREE.Mesh( boxGeometry, boxMaterial );
    handle.position.copy( handlePos );
    curveHandles.push( handle );
    controller.threeViewer.scene.add( handle );

  }
  const curve = new THREE.CatmullRomCurve3(curveHandles.map((handle) => handle.position));
  curve.curveType = "centripetal";
  //curve.closed = true;

  const points = curve.getPoints( 50 );
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints( points ),
    new THREE.LineBasicMaterial({color: "black"})
  );

  controller.threeViewer.scene.add( line );

  //geometry to be placed along the curve
  var rect = new THREE.SphereBufferGeometry(5,8,6);

  //rect.rotateY(-Math.PI/2);

  const objectToCurve = new THREE.Mesh(rect, new THREE.MeshStandardMaterial({color: 0x99ffff}));
  objectToCurve.name = "toBeMoved";
  const flowLine = new Flow(objectToCurve);

  flowLine.updateCurve(0, curve);
  flowLine.name = "curve";
  controller.threeViewer.scene.add(flowLine.object3D);

  return flowLine;
  */

  return null;
}

init();