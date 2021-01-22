// ---------------------------------------------------------------------------------------------------- //

// --- IMPORTS --- //
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

// ---------------------------------------------------------------------------------------------------- //


// --- BASIC CONSTANTS --- //
const width = window.innerWidth; // this makes the 3D canvas full screen
const height = window.innerHeight; // this makes the 3D canvas full screen

let vavinLatLon = [48.8441416, 2.3288795]; //initial center of scene/camera
let vavinCenter = proj4(proj4326, proj3857, [vavinLatLon[1], vavinLatLon[0]]);

// --- MAIN SCENE PARAMETERS >> DO NOT CHANGE "tileZoom" TO "true" FOR THE TIME BEING --- //
const paramsWind = {
  center: vavinCenter,
  zoom: 18,
  layers: ["bati_surf", "bati_zai"],
  //layers : [], //-> useful to test without importing the map (but best is to comment OLViewer lines in VTController initialisation)
  style: muetStyle,
  tileZoom: false //MUST REMAIN "false". But "true" is actually given to the ThreeViewer at its creation (see VTController initialisation)
  // It is quite risky to change it so I did not dare touch it.
};

let params = paramsWind;
let controller = null;

// ---------------------------------------------------------------------------------------------------- //

async function init() {

  //Initialisation function. Creating the controller and setting the GUI behaviour

  //GUI PARAMS : each param corresponds to a visualisation feature to be modified 
  var paramsGUI = {
    meshScale : 1,
    meshWidth : 0.2,
    meshHeight : 15,
    heightNoise : 0,
    meshType : "Cylinder",
    meshSpeed : 0.01,
    opacityMax : 0.55,
    opacityMin : 0,
    meshXY : "Unchanging",
    flowLine : false,
    enableDifferentScale : "Unchanging",
    colorMax : [160, 0, 0],
    colorMin : [0, 160, 0],
    meshLife : 1
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
    paramsGUI, //all GUI params
  );

  // ---------------------------------------------------------------------------------------------------- //

  // GUI AND PARAMS SETTING
  var gui = new dat.GUI({name: "First GUI", hideable: true});
  var menuMesh = gui.addFolder("Mesh");
  //gui.remember(paramsGUI); NEVER UNDERSTOOD WHAT THIS WAS USEFUL FOR, IT IS WELL COMMENTED

  /*
  Some notes concerning the following :

  - Usually when we modify an "obj", meaning a flow object in the scene, we are modifying its children (children[0] mainly).
  Indeed "obj" is not directly a Mesh, it is a Group. It allows to handle several Meshes and apply several transformations
  to all theses Meshes together. It is therefore easier to add new shapes, new geometries, or change the current ones.
  Currently, cylinders and sphere are represented by a Group of one Mesh, while arrows contain two Meshes.

  - The Groups named "flow" are the flows below the city top, at the street level. The "skyFlow" are those over the rooftops.

  - For all params with intervals, it is absolutely possible (and sometimes probably necessary) to modify the intervals

  - Modifications occur on all flows, whatever their location or their layer (excepted color changes)

  - The Groups bear the important information of the flow : speed, current position, initial position, size etc...
  The Meshes only contain material information (opacity, color etc). The advantage is the following : when you change
  geometries, the Meshes themseles, nothing is lost since the Group is still in the scene and still bears the data.

  - The Groups are in only one case erased and created again : in the case of the zoom change, when the number of flows changes.
  This is mandatory since the input data is different. Everything has to be initialise again

  - There are currently three different zoom levels, and therefore three output files when "windGenerator.js" is executed.
  More information in the dedicated file

  - The words "geometries" and "Meshes" are sometimes used to talk about the same thing (the Meshes actually)

  - There could confusions with "size" and "scale". I chose to call "size" the real size of the flow, meaning the euclidean distance computed
  with its X, Y and Z speeds. The "scale" is the deformation factor, applied to the real size, which outputs the flow length. The "scale" is modified
  through the menu, even if it is called "Size" (a user understands better changing a size than a scale I suppose). The "size" value is actually
  immutable.

  - X represents longitude, Y latitude, Z altitude

  - By defautl, Meshes are oriented toward Y axis

  - Angles are computed in the trigonometric (anticlockwise) direction

  - The current scene is by default roughly oriented towards Y axis too
  */

  // Param to extend the life of a flow : how far can he move ? When/Where does he have to restart ?
  var changeLife = menuMesh.add(paramsGUI, "meshLife", 1, 100, 0.05).name("Flow Life").listen();
  changeLife.onChange(function(value){
    controller.meshLife = value;
  });

  // Param to change the length of a flow, or the radius if it is a sphere
  var changeScale = menuMesh.add(paramsGUI, "meshScale", 0.5, 5, 0.1).name("Size").listen();
  changeScale.onChange(function(value){
    controller.meshScale = value;
    if (paramsGUI.meshType == "Cylinder"){
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){ 
          // it is needed to take the current deformition into account before changing the size of the flow.
          // A flow has a "real" length, computed from its X,Y and Z speeds, and a "graphical" length, depending on the scale
          var mat = new Matrix4().makeScale(1, value/obj.currentScale, 1);

          // updating the object's scale
          obj.currentScale = value;

          // saving the current orientation : necessary to apply a scale on an absolute direction of the canvas
          // the X, Y and Z axis are the scene axis, not the local axis of the flow
          var quaternion = new THREE.Quaternion();
          obj.getWorldQuaternion(quaternion);

          // removing the orientation
          obj.rotation.set(0,0,0);

          // scaling
          obj.children[0].applyMatrix4(mat);

          //re-applying the orientation
          obj.applyQuaternion(quaternion);
        }
      });
    }
    else if (paramsGUI.meshType == "Sphere"){
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){

          // This time there is no need for orientation handling : spheres do not have any orientation
          // Instead we need to change their scale in all different direction
          var mat = new Matrix4().makeScale(value/obj.currentScale, value/obj.currentScale, value/obj.currentScale);
          obj.currentScale = value;
          obj.children[0].applyMatrix4(mat);

        }
      });
    }
    else if (paramsGUI.meshType == "Arrow"){
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){ 

          // This is similar to Cylinder
          var mat = new Matrix4().makeScale(1, value/obj.currentScale, 1);
          obj.currentScale = value;
          var quaternion = new THREE.Quaternion();
          obj.getWorldQuaternion(quaternion);
          obj.rotation.set(0,0,0);
          obj.applyQuaternion(quaternion);

          // Since there is more than one child, we iterate over the Group's children (2 here)
          obj.children.forEach(function(mesh){
            mesh.applyMatrix4(mat);
          });
        }
      });
    }
    else{
      console.log("Your request could not be processed : impossible to change size with this geometry. \n Please try another one.");
    }
  });

  // Param to change the width of a flow, only for cylinder and arrow
  // Identical as changeScale, but applied on axis X and Z only
  var changeWidth = menuMesh.add(paramsGUI, "meshWidth", 0.1, 3, 0.02).name("Width").listen();
  changeWidth.onChange(function(value){
    controller.meshWidth = value;
    if (paramsGUI.meshType == "Cylinder"){
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){ 

          var mat = new Matrix4().makeScale(value/obj.currentWidth, 1, value/obj.currentWidth);
          obj.currentWidth = value;
          var quaternion = new THREE.Quaternion();
          obj.getWorldQuaternion(quaternion);
          obj.rotation.set(0,0,0);
          obj.children[0].applyMatrix4(mat);
          obj.applyQuaternion(quaternion);
        }
      });
    }
    else if (paramsGUI.meshType == "Sphere"){
      console.log("Impossible to modify this parameter with spheres as geometries. Please try again with \"Size\".");
    }
    else if (paramsGUI.meshType == "Arrow"){
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){ 

          var mat = new Matrix4().makeScale(value/obj.currentWidth, 1, value/obj.currentWidth);
          obj.currentWidth = value;
          var quaternion = new THREE.Quaternion();
          obj.getWorldQuaternion(quaternion);
          obj.rotation.set(0,0,0);
          obj.applyQuaternion(quaternion);

          // Since there is more than one child, we iterate over the Group's children (2 here)
          obj.children.forEach(function(mesh){
            mesh.applyMatrix4(mat);
          });
        }
      });
    }
    else{
      console.log("Your request could not be processed : impossible to change size with this geometry. \n Please try another one.");
    }
  });

  /*
  Param to (dis)allow the possibility to change the numbers of Meshes depending on the zoom level in the scene.
  BEWARE : the zoom level with a PerspectiveCamera is different from a real zoom. Being closer to an object does not mean higher zoom.
  It only depends on how much you've wheeled your mouse. If your are at street scale, but without having wheeled forward, your zoom
  will be considered extremely low, like if you were above the city.
  */
  var changeDifferentScale = menuMesh.add(paramsGUI, "enableDifferentScale", ["Unchanging", "Adapted"]).name("Flow Amount").listen();
  changeDifferentScale.onChange(function(value){
    controller.enableDifferentScale = value;
  });

  // Param to change the maximum opacity of the flows, reached at the middle of their trajectory
  var changeOpacityMax = menuMesh.add(paramsGUI, "opacityMax", 0, 1, 0.01).name("Max Opacity").listen();
  changeOpacityMax.onChange(function(value){
    controller.opacityMax = value;
  });

  // Param to change the minimum opacity of the flows, reached at the beginning and the end of their trajectory
  var changeOpacityMin = menuMesh.add(paramsGUI, "opacityMin", 0, 1, 0.01).name("Min Opacity").listen();
  changeOpacityMin.onChange(function(value){
    controller.opacityMin = value;
  });

  // Param to change the translation speed of the flows.
  var changeSpeed = menuMesh.add(paramsGUI, "meshSpeed", 0, 0.3, 0.005).name("Speed").listen();
  changeSpeed.onChange(function(value){
    controller.meshSpeed = value;
  });

  // Param to change the "strong flows" main color (a gradient is computed according to all the scene flows)
  var changeColorMax = menuMesh.addColor(paramsGUI, "colorMax").name("High Color").listen();
  changeColorMax.onChange(function(value){
    controller.colorMax = value;
    controller.updateColor();
  });

  // Param to change the "weeak flows" main color (a gradient is computed according to all the scene flows)
  var changeColorMin = menuMesh.addColor(paramsGUI, "colorMin").name("Low Color").listen();
  changeColorMin.onChange(function(value){
    controller.colorMin = value;
    controller.updateColor();
  });

  // Param to manually change the altitude of each flow. Especially useful at street scale
  var changeHeight = menuMesh.add(paramsGUI, "meshHeight", 0, 50, 0.5).name("Height").listen();
  changeHeight.onChange(function(value){
    controller.threeViewer.scene.traverse(function(obj){
      if (obj.name == "flow"){
        obj.position.z = value;
        obj.currentZ = value;
      }
      else if (obj.name =="skyFlow"){
        obj.position.z = obj.initPosZ + value;
        obj.currentZ = obj.initPosZ + value;
      }
    });
  });

  // Param to add a "height noise" in the flows. Randomly modifies their altitude to make them look more natural
  var changeHeightNoise = menuMesh.add(paramsGUI, "heightNoise", 0, 10, 0.5).name("Height Noise").listen();
  changeHeightNoise.onChange(function(value){
    controller.heightNoise = value;
    controller.threeViewer.scene.traverse(function(obj){
      if (obj.name == "flow" || obj.name == "skyFlow"){
        var modifier = Math.random() * (2*value) - value;
        obj.position.z = obj.initPosZ + modifier;
        obj.currentZ = obj.position.z;
      }
    });
  });

  // Param to add a "lat/lon noise" in the flows. Randomly modifies their X, Y coordinates to make them look more natural
  var changeXY = menuMesh.add(paramsGUI, "meshXY", ["Unchanging", "Random"]).name("Lat/Lon Noise").listen();
  changeXY.onChange(function(value){
    if (value == "Unchanging"){
      controller.threeViewer.scene.traverse(function(obj){
        if (obj.name == "flow" || obj.name == "skyFlow"){
          obj.position.x = obj.initPosX;
          obj.position.y = obj.initPosY;
          obj.position.z = obj.initPosZ;
        }
      });
    }
    controller.meshXY = value;
  });

  // Param to change the geometry of the flows. Particle is currently commented, since it has not been explored yet. Note that "Particle"
  var changeGeometry = menuMesh.add(paramsGUI, "meshType", ["Cylinder", "Sphere", "Arrow", /*, "Particule"*/]).name("Geometry").listen();
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

        // Mandatory to remove all Meshes and add the new ones again afterwards
        
        if (obj.children.length > 1){ //checking whether there are more than one mesh in the Group (useful only for arrows currently)

          for (var i = 1; i < obj.children.length; i++){ //starting at 1, to save one feature so as to save material data (color, opacity etc)
            obj.children[i].geometry.dispose();
            obj.children[i].material.dispose();
            controller.threeViewer.scene.remove(obj.children[i]);
            obj.remove(obj.children[i]);
          }

        }

        // For all geometries, the process is identical : saving the current Meshes main features, emptying each Group from the last Mesh, add the new
        // geometries (= meshes), and apply the old features to the new Meshes. Note that the Groups are NEVER withdrawn here.

        if (value == "Sphere"){
          var p = new THREE.SphereBufferGeometry(controller.meshScale*obj.size/3); //dividing by 3 to avoid huge spheres
          var m = obj.children[0].material.clone();
          var mesh = new THREE.Mesh(p, m);
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
          obj.add(mesh);

        }
        else if (value == "Cylinder"){
          var p = new THREE.CylinderBufferGeometry(controller.meshWidth*(2**controller.currentZoomLevel), 0.01);
          var mat = new Matrix4().makeScale(1, controller.meshScale*obj.size, 1);
          var m = obj.children[0].material.clone();
          var mesh = new THREE.Mesh(p, m);
          mesh.applyMatrix4(mat);
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
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
        else if (value == "Arrow"){

          var width = controller.meshWidth*(2**controller.currentZoomLevel);
          var p = new THREE.CylinderBufferGeometry(width, width);
          var mat = new Matrix4().makeScale(1, controller.meshScale*obj.size, 1);
          var m = obj.children[0].material.clone();
          var mesh = new THREE.Mesh(p, m);
          var meshPeak = new THREE.Mesh(new THREE.ConeBufferGeometry(2*width, 0.5), m);
          mesh.applyMatrix4(mat);
          meshPeak.applyMatrix4(mat);

          // positionning the peak of the arrow
          meshPeak.position.y += (controller.meshScale*obj.size)/2;

          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          controller.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);

          obj.add(mesh);
          obj.add(meshPeak);

        }
      }
    });

    controller.meshType = value;

    /*if (value == "Particule"){
      var particleSystem = new THREE.Points(particles, pMaterial);
      //obj.add(particleSystem);
      controller.threeViewer.scene.add(particleSystem);
    }*/

  });

  //Adding all the objects the first time. More information in the controller file, "VTController.js".

  //WARNING : if the curves visualisation is to be tested again, modify the following line this way :
  // controller.flowLine = controller.addObjects(3, paramsGUI.meshType);
  controller.addObjects(3, paramsGUI.meshType); //3 for the initial zoomLevel, cylinder as initial mesh

}

init();