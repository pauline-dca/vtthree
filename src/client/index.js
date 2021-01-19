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
import windData from "../../data/wind3.json";
import { abstract } from "ol/util";
import { CylinderBufferGeometry, Matrix4, SphereBufferGeometry } from "three";
import { extendRings } from "ol/extent";
import * as dat from 'dat.gui';
import { Mesh, Quaternion } from "three/build/three.module";


const width = window.innerWidth; // this makes the 3D canvas full screen
const height = window.innerHeight; // this makes the 3D canvas full screen

let vavinLatLon = [48.8441416, 2.3288795];
let vavinCenter = proj4(proj4326, proj3857, [vavinLatLon[1], vavinLatLon[0]]);

let baseSpeed = 0.2;
let withFlowLine = false;

const paramsWind = {
  center: vavinCenter,
  zoom: 18,
  //layers: ["bati_surf", "bati_zai"],
  layers : [],
  style: muetStyle,
  tileZoom: false
};

let params = paramsWind;
let controller = null;

async function init() {

  var paramsGUI = {tailleMesh : 1,
    couleurMesh : "#000000",
    hauteurMesh : 15,
    typeFourchette : 0,
    typeMesh : "Cylindre",
    geomFlux : "mesh",
    nbFlux : 10,
    speedFlux : 0.05,
    opaciteMax : 0.55,
    opaciteMin : 0,
    newPosFlux : "Fixe",
    contFlux : null,
    flowLine : false,
    enableDifferentScale : "Fixe"
  }

  controller = new VTController(
    width,
    height,
    params.center, //center coordinates in webmercator
    params.zoom, //zoom level
    params.layers, //layers to be rendered as 3D features
    mergedRender, //render type, merged render more efficient but does not provide access to each feature
    params.style, //style for the tiles
    params.tileZoom,
    paramsGUI,
  );

  // GUI AND PARAMS SETTING
  var gui = new dat.GUI({name: "First GUI", hideable: true});
  var menuMesh = gui.addFolder("Mesh");

  //gui.remember(paramsGUI);


  var changeTaille = menuMesh.add(paramsGUI, "tailleMesh", 0.5, 5, 0.1).name("Taille").listen();
  changeTaille.onChange(function(value){ //FAIRE POUR QUE ÇA NE RECHARGE PAS SI C'ÉTAIT DÉJÀ ÇA
    if (paramsGUI.typeMesh == "Cylindre"){ //only with Cylindre
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){ 
          var mat = new Matrix4().makeScale(1, value/obj.currentScale, 1);
          var quaternion = new THREE.Quaternion();
          obj.children[0].getWorldQuaternion(quaternion);
          obj.children[0].rotation.set(0,0,0);
          obj.children[0].applyMatrix4(mat);
          obj.currentScale = value;
          obj.children[0].applyQuaternion(quaternion);
        }
      });
    }
    else if (paramsGUI.typeMesh == "Sphere"){ //MARCHE MAIS RAME DU CUL
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){
          var oldMaterial = obj.children[0].material.clone();
          var geomSphere = new THREE.SphereBufferGeometry(value);
          var meshSphere = new Mesh(geomSphere, oldMaterial);
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
          obj.add(meshSphere);
        }
      });
    }
    else{
      console.log("Impossible de modifier la taille avec ce type de Mesh (cylindre uniquement");
    }
  });

  var changeDifferentScale = menuMesh.add(paramsGUI, "enableDifferentScale", ["Fixe", "Adapté"]).name("Nombre flux").listen();
  changeDifferentScale.onChange(function(value){
    controller.enableDifferentScale = value;
  });

  var changeOpaciteMax = menuMesh.add(paramsGUI, "opaciteMax", 0, 1, 0.01).name("Opacité Max").listen();
  changeOpaciteMax.onChange(function(value){
    controller.opaciteMax = value;
  });

  var changeOpaciteMin = menuMesh.add(paramsGUI, "opaciteMin", 0, 1, 0.01).name("Opacité Min").listen();
  changeOpaciteMin.onChange(function(value){
    controller.opaciteMin = value;
  });

  var changeSpeed = menuMesh.add(paramsGUI, "speedFlux", 0, 1, 0.01).name("Vitesse").listen();
  changeSpeed.onChange(function(value){
    controller.baseSpeed = value;
  });

  var changeCouleur = menuMesh.addColor(paramsGUI, "couleurMesh").name("Couleur").listen();
  changeCouleur.onChange(function(value){
    console.log(paramsGUI.speedFlux);
    controller.threeViewer.scene.traverse(function(obj){
      if (obj.name == "flow" || obj.name == "skyFlow"){
        obj.children[0].material.color.set(value);
      }
    });
  });

  var changeHauteur = menuMesh.add(paramsGUI, "hauteurMesh", 0, 50, 0.5).name("Hauteur").listen();
  changeHauteur.onChange(function(value){
    controller.threeViewer.scene.traverse(function(obj){
      if (obj.name == "flow"){
        obj.position.z = value;
        obj.initPosZ = value;
      }
      else if (obj.name =="skyFlow"){
        obj.position.z = 45 + value;
        obj.initPosZ = 45 + value;
      }
    });
  });

  var fourchetteHauteur = menuMesh.add(paramsGUI, "typeFourchette", 0, 10, 0.5).name("Hauteur simulée").listen();
  fourchetteHauteur.onChange(function(value){
    controller.typeFourchette = value;
    controller.threeViewer.scene.traverse(function(obj){
      if (obj.name == "flow" || obj.name == "skyFlow"){
        var modifier = Math.random() * (2*value) - value;
        obj.position.z = obj.initPosZ + modifier;
        obj.currentZ = obj.position.z;
      }
    });
  });

  var changeRepos = menuMesh.add(paramsGUI, "newPosFlux", ["Fixe", "Aléatoire"]).name("Repositionnement aléatoire").listen();
  changeRepos.onChange(function(value){
    if (value == "Fixe"){
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){
          obj.position.x = obj.initPosX;
          obj.position.y = obj.initPosY;
          obj.position.z = obj.initPosZ;
        }
      });
    }
    controller.reposFlux = value; //ATTENTION, LE RANDOM JOUE SUIVANT LA TAILLE DU FLUX (flow.size), MAIS CELLE CI N'EST PAS MISE À JOUR LORSQUE LA VARIABLE TAILLE EST CHANGÉE DANS LE MENU
  });

  var changeGeometry = menuMesh.add(paramsGUI, "typeMesh", ["Cylindre", "Sphere", "Particule"]).name("Forme").listen();
  changeGeometry.onChange(function(value){
    // possible values are for the time being : cylinder, sphere (Particle to come)
    controller.typeMesh = value;
    if (value == "Particule"){
      var particles = new THREE.Geometry();
      var pMaterial = new THREE.PointsMaterial({
        color: "#000000",
        size : 5,
        transparent : true,
        blending: THREE.AdditiveBlending
      });
    }
    
    controller.threeViewer.scene.traverse(function(obj){
      if (obj.name == "flow" || obj.name == "skyFlow"){
        if (value == "Sphere"){
          var p = new THREE.SphereBufferGeometry(1);
          var m = obj.children[0].material.clone();
          var mesh = new THREE.Mesh(p, m);
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
          obj.add(mesh);

        }
        else if (value == "Cylindre"){
          var p = new THREE.CylinderBufferGeometry(0.2, 0.01);
          var m = obj.children[0].material.clone();
          var mesh = new THREE.Mesh(p, m);
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
          controller.orientateMesh(mesh, obj.speedX, obj.speedY, obj.speedZ, obj.size);
          obj.add(mesh);
        }
        else if (value == "Particule"){
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
          var particle = new THREE.Vector3(obj.initPosX, obj.initPosY, obj.initPosZ);
          particles.vertices.push(particle);
        }
      }
    });

    if (value == "Particule"){
      var particleSystem = new THREE.Points(particles, pMaterial);
      obj.add(particleSystem);
      //controller.threeViewer.scene.add(particleSystem);
    }

  });

  var flowLine = controller.addObjects(3, "Cylindre"); //3 for the initial zoomLevel  , Cylindre as initial mesh
  controller.flowLine = flowLine;
}


function orientateMesh(mesh, speedX, speedY, speedZ, length){
  mesh.applyMatrix4(new Matrix4().makeScale(1, length, 1));
  mesh.rotateOnWorldAxis(new THREE.Vector3(1,0,0), Math.atan(speedZ/length)); //rotation X (direction haut bas)

  //Rotation handling :
  
  if (speedX >= 0){ //vitesse en longitude, selon les x
    if (speedY >= 0){ //vitesse en latitude, selon les y
      //quart haut droit du cercle trigo, si l'on place les x au nord, car l'orientation de base des meshs est dirigée vers les y
      mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), - Math.atan(speedX/speedY)); //rotation selon Z (direction lat lon)
    }
    else{
      //quart bas droit
      mesh.material.color.set("red");
      mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), - Math.atan(speedX/speedY) - Math.PI);
    }
  }
  else{
    if (speedY >= 0){
      //quart haut gauche
      mesh.material.color.set("green");
      mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), Math.atan(speedY/speedX) + Math.PI/2);
    }
    else{
      //quart bas gauche
      mesh.material.color.set("blue");
      mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), Math.PI/2 + Math.atan(speedY/speedX));
    }
  }
}
/*
function addObjects() {
  
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
    orientateMesh(mesh, point.u, point.v, point.w, flowSize);

    //Postionning the objects
    var cooWebMerca = proj4(proj4326, proj3857, [point.lon, point.lat]);
    var goodCoords = controller.threeViewer.getWorldCoords(cooWebMerca);

    var flow = new THREE.Group();
    flow.add(mesh);
    if (point.z > 50){
      flow.name = "skyFlow";
    }
    else{
      flow.name = "flow";
    }

    flow.initPosX = goodCoords[0];
    flow.initPosY = goodCoords[1];
    flow.initPosZ = point.z;
    flow.currentZ = point.z;
    flow.position.x = goodCoords[0];
    flow.position.y = goodCoords[1];
    flow.position.z = point.z
    flow.speedX = point.u;
    flow.speedY = point.v;
    flow.speedZ = point.w;
    flow.size = flowSize;
    flow.currentScale = 1;

    controller.threeViewer.scene.add(flow);
/*
    var quaternion = new THREE.Quaternion();
    mesh.getWorldQuaternion(quaternion);
    var euler_rot = new THREE.Euler().setFromQuaternion(quaternion);
    console.log(euler_rot);*/
    //console.log(mesh.scale);

    


  //}); 

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

  //return null;
//}

init();