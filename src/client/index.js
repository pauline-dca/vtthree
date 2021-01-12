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


const width = window.innerWidth; // this makes the 3D canvas full screen
const height = window.innerHeight; // this makes the 3D canvas full screen

let vavinLatLon = [48.8441416, 2.3288795];
let vavinCenter = proj4(proj4326, proj3857, [vavinLatLon[1], vavinLatLon[0]]);

const paramsWind = {
  center: vavinCenter,
  zoom: 18,
  layers: ["bati_surf", "bati_zai"],
  //layers : [],
  style: muetStyle
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
    false,
    null
  );
  var flowLine = addObjects();
  controller.flowLine = flowLine;
}

function addObjects() {
  
  windData.forEach(function(point){
    
    //Initial buffer geometries

    var flowWidthTop = 0.2
    var flowWidthBottom = 0.01

    var p = new THREE.CylinderBufferGeometry(flowWidthTop, flowWidthBottom);
    var sphere = new SphereBufferGeometry(flowWidthTop, 8, 6);

    // Some main parameters for the flows, to be modified depending on the context...
    var coef = 5;
    var flowSize = coef*Math.sqrt(point.u**2 + point.v**2)

    //Rotation handling :
    
    if (point.u >= 0){ //vitesse en longitude, selon les x
      if (point.v >= 0){ //vitesse en latitude, selon les y
        //quart haut droit du cercle trigo, si l'on place les x au nord, car l'orientation de base des meshs est dirigée vers les y
        var m = new THREE.MeshStandardMaterial({color : "black", opacity: 1, transparent: true});
        var mesh = new THREE.Mesh(p, m);
        mesh.applyMatrix4(new Matrix4().makeScale(1, flowSize, 1));
        mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), - Math.atan(point.u/point.v));
      }
      else{
        //quart bas droit
        var m = new THREE.MeshStandardMaterial({color : "black",  opacity: 1, transparent: true});
        var mesh = new THREE.Mesh(p, m);
        mesh.applyMatrix4(new Matrix4().makeScale(1, flowSize, 1));
        mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), - Math.atan(point.u/point.v) - Math.PI);
      }
    }
    else{
      if (point.v >= 0){
        //quart haut gauche
        var m = new THREE.MeshStandardMaterial({color : "black",  opacity: 1, transparent: true});
        var mesh = new THREE.Mesh(p, m);
        mesh.applyMatrix4(new Matrix4().makeScale(1, flowSize, 1));
        mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), Math.atan(point.v/point.u) + Math.PI/2);
      }
      else{
        //quart bas gauche
        var m = new THREE.MeshStandardMaterial({color : "black",  opacity: 1, transparent: true});
        var mesh = new THREE.Mesh(p, m);
        mesh.applyMatrix4(new Matrix4().makeScale(1, flowSize, 1));
        mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), Math.PI/2 + Math.atan(point.v/point.u));
      }
    }

    var sphereMesh = new THREE.Mesh(sphere, m)

    //Postionning the objects
    var cooWebMerca = proj4(proj4326, proj3857, [point.lon, point.lat]);
    var goodCoords = controller.threeViewer.getWorldCoords(cooWebMerca);

    mesh.position.x = goodCoords[0];
    mesh.position.y = goodCoords[1];
    mesh.position.z = point.z;
    sphereMesh.position.x = goodCoords[0] + coef*point.u/2;
    sphereMesh.position.y = goodCoords[1] + coef*point.v/2;
    sphereMesh.position.z = point.z;

    var flow = new THREE.Group();
    flow.add(mesh);
    flow.add(sphereMesh);
    flow.name = "flow";
    flow.initPosX = goodCoords[0];
    flow.initPosY = goodCoords[1];
    flow.speedX = point.u;
    flow.speedY = point.v;

    controller.threeViewer.scene.add(flow);

    // TENTATIVE : RELIER LES UNS POINTS LES UNS AUX AUTRES

    var length = new THREE.Vector3();
    mesh.getWorldScale(length);

    


  }); 

  //TESTS WITH CURVES
  /*

  const curveHandles = [];

  var lstCurve = [
    { x: 50, y: -800, z: 120 },
    { x: 0, y: 0, z: 120 },
    { x: -200, y: 200, z: 120 },
  ];

  /*

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
  //var rect = new THREE.SphereBufferGeometry(5,8,6);

  var rect = new THREE.CylinderBufferGeometry(0.3, 0.02, 100);
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
