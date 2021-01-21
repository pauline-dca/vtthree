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
    hauteurMesh : 15,
    typeFourchette : 0,
    typeMesh : "Flèche",
    geomFlux : "mesh",
    nbFlux : 10,
    speedFlux : 0.01,
    opaciteMax : 0.55,
    opaciteMin : 0,
    newPosFlux : "Fixe",
    contFlux : null,
    flowLine : false,
    enableDifferentScale : "Fixe",
    colorMax : [160, 0, 0],
    colorMin : [0, 160, 0],
    dureeVie : 1
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

  var changeDureeVie = menuMesh.add(paramsGUI, "dureeVie", 1, 100, 0.05).name("Parcours Flux").listen();
  changeDureeVie.onChange(function(value){
    controller.dureeVie = value;
  });

  var changeTaille = menuMesh.add(paramsGUI, "tailleMesh", 0.5, 5, 0.1).name("Taille").listen();
  changeTaille.onChange(function(value){ //FAIRE POUR QUE ÇA NE RECHARGE PAS SI C'ÉTAIT DÉJÀ ÇA
    controller.tailleMesh = value;
    if (paramsGUI.typeMesh == "Cylindre"){ //only with Cylindre
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){ 
          var mat = new Matrix4().makeScale(1, value/obj.currentScale, 1);
          obj.currentScale = value;
          var quaternion = new THREE.Quaternion();
          obj.getWorldQuaternion(quaternion);
          obj.rotation.set(0,0,0);
          obj.children[0].applyMatrix4(mat);
          //obj.currentScale = value;
          obj.applyQuaternion(quaternion);
        }
      });
    }
    else if (paramsGUI.typeMesh == "Sphere"){ //MARCHE MAIS RAME
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){
          var oldMaterial = obj.children[0].material.clone();
          var geomSphere = new THREE.SphereBufferGeometry(value);
          obj.currentScale = value;
          var meshSphere = new Mesh(geomSphere, oldMaterial);
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
          obj.add(meshSphere);
        }
      });
    }
    else if (paramsGUI.typeMesh == "Flèche"){
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){ 
          var mat = new Matrix4().makeScale(1, value/obj.currentScale, 1);
          obj.currentScale = value;
          var quaternion = new THREE.Quaternion();
          obj.getWorldQuaternion(quaternion);
          obj.rotation.set(0,0,0);
          obj.currentScale = value;
          obj.applyQuaternion(quaternion);

          obj.children.forEach(function(mesh){
            mesh.applyMatrix4(mat);
          });
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

  var changeSpeed = menuMesh.add(paramsGUI, "speedFlux", 0, 0.2, 0.005).name("Vitesse").listen();
  changeSpeed.onChange(function(value){
    controller.baseSpeed = value;
  });

  var changeCouleurMax = menuMesh.addColor(paramsGUI, "colorMax").name("Couleur Max").listen();
  changeCouleurMax.onChange(function(value){
    controller.colorMax = value;
    controller.updateColor();
  });

  var changeCouleurMin = menuMesh.addColor(paramsGUI, "colorMin").name("Couleur Min").listen();
  changeCouleurMin.onChange(function(value){
    controller.colorMin = value;
    controller.updateColor();
  });

  var changeHauteur = menuMesh.add(paramsGUI, "hauteurMesh", 0, 50, 0.5).name("Hauteur").listen();
  changeHauteur.onChange(function(value){
    controller.threeViewer.scene.traverse(function(obj){
      if (obj.name == "flow"){
        obj.position.z = value;
        obj.initPosZ = value;
        obj.currentZ = value;
      }
      else if (obj.name =="skyFlow"){
        obj.position.z = obj.initPosZ + value;
        //obj.initPosZ = obj.initPosZ + value;
        obj.currentZ = obj.initPosZ + value;
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

  var changeGeometry = menuMesh.add(paramsGUI, "typeMesh", ["Cylindre", "Sphere", "Flèche", /*, "Particule"*/]).name("Forme").listen();
  changeGeometry.onChange(function(value){
    
    /*if (value == "Particule"){
      var particles = new THREE.Geometry();
      var pMaterial = new THREE.PointsMaterial({
        color: "#000000",
        size : 5,
        transparent : true,
        blending: THREE.SubtractiveBlending
      });
    }*/
    
    controller.threeViewer.scene.traverse(function(obj){

      if (obj.name == "flow" || obj.name == "skyFlow"){
        
        if (obj.children.length > 1){ //il faut supprimer le cône définitivement si c'est une flèche

        obj.children[1].geometry.dispose();
        obj.children[1].material.dispose();
        controller.threeViewer.scene.remove(obj.children[1]);
        obj.remove(obj.children[1]);
        }

        if (value == "Sphere"){
          var p = new THREE.SphereBufferGeometry(controller.tailleMesh);
          var m = obj.children[0].material.clone();
          var mesh = new THREE.Mesh(p, m);
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
          obj.add(mesh);

        }
        else if (value == "Cylindre"){
          var p = new THREE.CylinderBufferGeometry(0.2*(2**controller.currentZoomLevel), 0.01);
          var mat = new Matrix4().makeScale(1, controller.tailleMesh*obj.size, 1);
          var m = obj.children[0].material.clone();
          var mesh = new THREE.Mesh(p, m);
          mesh.applyMatrix4(mat);
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
          //controller.orientateMesh(obj, obj.speedX, obj.speedY, obj.speedZ, obj.size);
          obj.add(mesh);
        }
        /*else if (value == "Particule"){
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
          var particle = new THREE.Vector3(obj.initPosX, obj.initPosY, obj.initPosZ);
          particles.vertices.push(particle);
        }*/
        else if (value == "Flèche"){

          var width = 0.2*(2**controller.currentZoomLevel);
          var p = new THREE.CylinderBufferGeometry(width, width);
          var mat = new Matrix4().makeScale(1, controller.tailleMesh*obj.size, 1);
          var m = obj.children[0].material.clone();
          var mesh = new THREE.Mesh(p, m);
          var meshPeak = new THREE.Mesh(new THREE.ConeBufferGeometry(2*width, 0.5), m);
          mesh.applyMatrix4(mat);
          meshPeak.applyMatrix4(mat);

          meshPeak.position.y += obj.size/2;

          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);

          obj.add(mesh);
          obj.add(meshPeak);

          //controller.orientateMesh(obj, obj.speedX, obj.speedY, obj.speedZ, obj.size);
          

        }
      }
    });

    controller.typeMesh = value;

    /*if (value == "Particule"){
      var particleSystem = new THREE.Points(particles, pMaterial);
      //obj.add(particleSystem);
      controller.threeViewer.scene.add(particleSystem);
    }*/

  });

  var flowLine = controller.addObjects(3, paramsGUI.typeMesh); //3 for the initial zoomLevel  , Cylindre as initial mesh
  controller.flowLine = flowLine;
}

init();