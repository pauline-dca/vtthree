// ---------------------------------------------------------------------------------------------------- //

// --- IMPORTS --- //
import { VTThreeViewer, RENDER_MODE } from "./VTThreeViewer";
import * as THREE from "three";
import { OLViewer, IGN_STYLES } from "./OLViewer";
import Feature from "ol/Feature";
import { ZOOM_RES_L93 } from "./Utils";
import { Euler, Vector3 } from "three";
import { distance, rhumbDistance } from "@turf/turf";
import * as dat from 'dat.gui';

//Scale data imports
import windDataHighScale from "../../data/wind1.json";
import windDataMediumScale from "../../data/wind2.json";
import windDataLowScale from "../../data/wind3.json";

//From index.js imports
import { CylinderBufferGeometry, Matrix4, SphereBufferGeometry } from "three";
import "regenerator-runtime/runtime";
import proj4 from "proj4";
import { proj4326, proj3857 } from "./Utils";

// ---------------------------------------------------------------------------------------------------- //

export class VTController {

  //Main class, controller everything happening in the scene (represented by the VTThreeViewer)

  constructor(
    width,
    height,
    center,
    zoom,
    layers,
    renderMode,
    style,
    tileZoom,
    paramsGUI // containing all graphical parameters to be changed through the menu
  ) {
    this.width = width;
    this.height = height;
    this.renderMode = renderMode;
    this.features = new Map();
    this.layers = layers;
    this.zoomOlViewer = this.zoomOlViewer.bind(this);
    this.loadTileFeatures = this.loadTileFeatures.bind(this);
    this.render = this.render.bind(this);
    this.init(center, zoom, renderMode, style, tileZoom);
    this.state = { loading: 0 };
    this.tileZoom = tileZoom;

    // each of the following is one given graphical parameter
    // there is probably a better way to store all these values
    this.flowLine = paramsGUI.flowLine;
    this.meshSpeed = paramsGUI.meshSpeed;
    this.opacityMax = paramsGUI.opacityMax;
    this.opacityMin = paramsGUI.opacityMin;
    this.meshXY = paramsGUI.meshXY;
    this.enableDifferentScale = paramsGUI.enableDifferentScale;
    this.meshType = paramsGUI.meshType;
    this.meshScale = paramsGUI.meshScale;
    this.colorMax = paramsGUI.colorMax;
    this.colorMin = paramsGUI.colorMin;
    this.meshLife = paramsGUI.meshLife;
    this.meshWidth = paramsGUI.meshWidth;
  }

  async init(center, zoom, renderMode, style, tileZoom) {

    // Creating the VTThreeViewer : white is the background color, !tileZoom MUST like this 
    this.threeViewer = new VTThreeViewer(
      this.width,
      this.height,
      "white",
      !tileZoom, //tileZoom is "false", so here "true" is actually given.
      center,
      ZOOM_RES_L93[zoom]
    );

    //It is best to comment these lines (until this.olViewer.layer.getSource().on("tileloadend", this.loadTileFeatures)) so as to prevent maps and buildings from loading
    //Otherwise it remained unchanged
    this.olViewer = await new OLViewer(
      this.width,
      this.height,
      center,
      zoom,
      style
    );
    let self = this;
    this.olViewer.map.on("rendercomplete", function() {
      console.log("map render complete!");
      var mapContainer = document.getElementById("map");
      var mapCanvas = mapContainer.getElementsByTagName("canvas")[0];
      self.threeViewer.setPlaneTexture(mapCanvas);
    });

    
    this.olViewer.layer.getSource().on("tileloadstart", function(evt) {
      self.state.loading++;
    });

    this.olViewer.layer.getSource().on("tileloadend", this.loadTileFeatures);

    // Zoom level initialisation. 3 represents the less precise level of details
    this.currentZoomLevel = 3

    this.threeViewer.renderer.domElement.addEventListener("wheel", event => {
 
      //computing the "zoom value" in a PerspectiveCamera (found on Stack...)
      var zoom = this.threeViewer.controls.target.distanceTo(this.threeViewer.controls.object.position);
      
      //1300 and 300 are abritrary threshold values : they have to be updated depending on the context.
      //For my internship example, it is working well.
      var instantZoomLevel = this.currentZoomLevel;
      if (zoom > 1300){
        instantZoomLevel = 3;
      }
      else if (zoom > 300){
        instantZoomLevel = 2;
      }
      else{
        instantZoomLevel = 1;
      }
      if (instantZoomLevel != this.currentZoomLevel){ //zoom level changed !
        
        this.currentZoomLevel = instantZoomLevel;
        if (this.enableDifferentScale == "Adapted"){ // linking to the menu option, enabling of disabling the zoom modifications
          this.changeFlowDensity(instantZoomLevel); //see end of this file for explanation on this function
        }
      }
    });

    //Start rendering
    this.render();
  }

  render() {
    if (this.tileZoom && this.state.loading != 0) { //unchanged
      console.log("render ol!");
      var mapContainer = document.getElementById("map");
      var mapCanvas = mapContainer.getElementsByTagName("canvas")[0];
      this.threeViewer.setPlaneTexture(mapCanvas);
    }

    //PLACING & ANIMATING FLOWS : MAIN LOOP FOR MOVEMENT IN THE SCENE
    this.threeViewer.scene.traverse (function (flow){ //"flow" represents the THREE.Group, not the Meshes inside
      if ((flow.name == "flow" || flow.name == "skyFlow") && flow.children.length > 0){

        /* Some notes concerning some flow attributes :

        - attributes are described at the end of the "addObject" function, at the end of this file

        - currentZ differs slightly from initPosZ : initPosZ is the real initial altitude, while currentZ takes into account
        the height noise and the height modifier triggered via the menu

        */

        // Real size (not scale) of the flow
        var size = flow.size

        // Computing the distance between the initial measure point of the flow and its current position
        // so as to know whether to replace it
        var currentDistanceFromInit = Math.sqrt((flow.initPosX - flow.position.x)**2 + (flow.initPosY - flow.position.y)**2 + (flow.currentZ - flow.position.z)**2);
        if (currentDistanceFromInit >= this.meshLife*size){

          if (this.meshXY == "Unchanging"){
            flow.position.x = flow.initPosX;
            flow.position.y = flow.initPosY;
          }
          else if (this.meshXY == "Random"){ // X, Y noise
            flow.position.x = flow.initPosX + (size*this.meshScale)*Math.random()/2; 
            flow.position.y = flow.initPosY + (size*this.meshScale)*Math.random()/2;
          }
          flow.position.z = flow.currentZ;
          currentDistanceFromInit = 0;
        }

        
        //MOVEMENT HANDLING

        var deltaX = flow.speedX*this.meshSpeed; //meshSpeed is the speed modifier from the menu while speedX is the real speed of the flow in this direction
        var deltaY = flow.speedY*this.meshSpeed;
        var deltaZ = flow.speedZ*this.meshSpeed;

        flow.position.x += deltaX; //updating all coordinates
        flow.position.y += deltaY;
        flow.position.z += deltaZ;

        //OPACITY HANDLING (OPACITY = FUNCTION OF POSITION... STRANGELY ENOUGH)
        if (currentDistanceFromInit < this.meshLife*size/2){ //ascending phase
          flow.children.forEach(function(mesh){

            // the formula allows to reach maximum opacity in the middle of the trajectory and minimum at extremities
            mesh.material.opacity = this.opacityMax + (currentDistanceFromInit - this.meshLife*size/2)/(this.meshLife*size/2) + this.opacityMin;

          }.bind(this));
        }
        else{ //descending phase
          flow.children.forEach(function(mesh){

            mesh.material.opacity = this.opacityMax - (currentDistanceFromInit - this.meshLife*size/2)/(this.meshLife*size/2) + this.opacityMin;

          }.bind(this));
        }
      }
    }.bind(this));

    /* Useless currently : allowed a Mesh to move along a curve, when I tested the curve visualisation
    if (this.flowLine){
      this.flowLine.moveAlongCurve(0.01);
    }*/

    // Rendering occurs every page refreshment, 60 times per second I believe
    this.threeViewer.animate();
    this.requestId = requestAnimationFrame(function() {
      this.render();
    }.bind(this)); 
  }

  loadVTile() { //unchanged
    return new Promise(function(resolve, reject) {
      this.olViewer.layer.getSource().on("tileloadend", resolve);
    });
  }

  zoomOlViewer(event) { //unchanged
    console.log("zoooooom!");
    //var zoom = controls.target.distanceTo( controls.object.position )
    //console.log(this.threeViewer.controls.target.distanceTo(this.threeViewer.controls.object.position));
    //this.olViewer.domElement.dispatchEvent(
    this.olViewer.map.getViewport().dispatchEvent(
      new WheelEvent("wheel", {
        // deltaX: event.deltaX,
        // deltaY: event.deltaY,
        // clientX: this.width / 4,
        // clientY: this.height / 4
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY
      })
    );
    event.preventDefault();
  }

  loadTileFeatures(evt) { //unchanged
    console.log("tile load end!");
    var z = evt.tile.getTileCoord()[0];
    var features = evt.tile.getFeatures();
    let layer = "";
    let self = this;
    let tileFeatures = new Map();
    for (let feature of features) {
      for (let layerName of self.layers) {
        if (feature.getProperties().layer == layerName) {
          layer = feature.getProperties().layer;
          if (!self.features.has(layer)) {
            self.features.set(layer, new Map());
          }
          if (!tileFeatures.has(layer)) {
            tileFeatures.set(layer, []);
          }
          if (!self.features.get(layer).has(feature.ol_uid)) {
            self.features.get(layer).set(feature.ol_uid, feature);
            tileFeatures.get(layer).push(feature);
          }
        }
      }
    }
    tileFeatures.forEach((value, key) => {
      self.threeViewer.addFeatures(
        value,
        self.olViewer.map.getView().getCenter(),
        ZOOM_RES_L93[self.olViewer.map.getView().getZoom()],
        key,
        self.renderMode
      );
    });

    self.state.loading--;
    if (self.state.loading == 0) {
      this.olViewer.layer.getSource().on("tileloadend", evt => {
        self.state.loading--;
      });
    }
  }

  orientateMesh(mesh, speedX, speedY, speedZ, length){

    // Orientates the flows (if the Meshes are not spheres) according to their speeds.

    // Z direction : the rotation occurs along the X axis since Meshes are basically pointing the Y axis..
    mesh.rotateOnWorldAxis(new THREE.Vector3(1,0,0), Math.atan(speedZ/length));
    
    if (speedX >= 0){ // X represents longitude
      if (speedY >= 0){ // Y represents latitude
        mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), - Math.atan(speedX/speedY));
      }
      else{
        mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), - Math.atan(speedX/speedY) - Math.PI);
      }
    }
    else{
      mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1), Math.atan(speedY/speedX) + Math.PI/2);
    }
  }

  componentToHex(c) { //subfunction helping to convert rgb colors to hexadecimal colors
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
  }
  
  rgbToHex(r, g, b) { // converting rgb colors to hexadecimal colors
    return "#" + this.componentToHex(r) + this.componentToHex(g) + this.componentToHex(b);
  }

  updateColor(){ // changing all Meshes' color when the user modifies the max/min color in the menu
    this.threeViewer.scene.traverse(function(obj){
      if (obj.name == "flow" || obj.name == "skyFlow"){
        var relativeSize = obj.rg;
        var nbRed = Math.floor(relativeSize*this.colorMax[0] + (1 - relativeSize)*this.colorMin[0]);
        var nbGreen = Math.floor(relativeSize*this.colorMax[1] + (1 - relativeSize)*this.colorMin[1]);
        var nbBlue = Math.floor(relativeSize*this.colorMax[2] + (1 - relativeSize)*this.colorMin[2]);
        var pointColor = this.rgbToHex(nbRed, nbGreen, nbBlue);
        obj.children.forEach(function(mesh){

          mesh.material.color.set(pointColor);
        }.bind(this)); 
      }
    }.bind(this));
  }

  // convert an hexadecimal color to a rgb color. Not used.
  /*
  convertToRGB(stringHex){
    if(stringHex.length != 6){
        throw "Only six-digit hex colors are allowed.";
    }

    var col = stringHex.shift();
    var aRgbHex = col.match(/.{1,2}/g); //expression régulière
    var aRgb = [
        parseInt(aRgbHex[0], 16),
        parseInt(aRgbHex[1], 16),
        parseInt(aRgbHex[2], 16)
    ];
    return aRgb;
  }*/
  
  addObjects(zoomLevel, meshType) {

    // MAIN FUNCTION FOR ADDING OBJECTS IN THE SCENE.
    // Is called at the beginning, and when zoom changes occur. The param meshType corresponds to cylinder, sphere or arrow.

    // Using the good source file depending on the current zoom
    var windData;
    if (zoomLevel == 3){
      windData = windDataLowScale;
    }
    else if (zoomLevel == 2){
      windData = windDataMediumScale;
    }
    else{
      windData = windDataHighScale;
    }
    
    windData.forEach(function(point){ //"point" represents a measured point, a flow
      
      //Initial buffer geometries
  
      var relativeSize = point.rg; // size relatively to all flows in the scene. Varies from 0.xxx (shortest) to 1 (longest)

      //Computing the color of the flow depending on its relative size
      var nbRed = Math.floor(relativeSize*this.colorMax[0] + (1 - relativeSize)*this.colorMin[0]);
      var nbGreen = Math.floor(relativeSize*this.colorMax[1] + (1 - relativeSize)*this.colorMin[1]);
      var nbBlue = Math.floor(relativeSize*this.colorMax[2] + (1 - relativeSize)*this.colorMin[2]);
      var pointColor = this.rgbToHex(nbRed, nbGreen, nbBlue);

      //Final material
      var m = new THREE.MeshStandardMaterial({color : pointColor, opacity: 1, transparent: true});

      var flowSize = Math.sqrt(point.u**2 + point.v**2 + point.w**2); //real size of the flow
      var flowWidthTop = this.meshWidth*(2**zoomLevel); // width used for cylinders and arrows
  
      if (meshType == "Cylinder"){
        var flowWidthBottom = 0.01; // pointy cylinders
        var p = new THREE.CylinderBufferGeometry(flowWidthTop, flowWidthBottom);
        // The scale occurs on the Y axis since Meshes are initilly oriented towards it
        var mat = new Matrix4().makeScale(1, this.meshScale*flowSize, 1); // the scale is a combination of the real size and the scale modifier
        var mesh = new THREE.Mesh(p, m);
        mesh.applyMatrix4(mat);
      }
      else if (meshType == "Sphere"){
        var p = new THREE.SphereBufferGeometry(this.meshScale*flowSize/3); //dividing by 3 to avoid huge spheres
        var mesh = new THREE.Mesh(p, m);
      }
      else if (meshType == "Arrow"){
        var hilt = new THREE.CylinderBufferGeometry(flowWidthTop, flowWidthTop);
        var peak = new THREE.ConeBufferGeometry(2*flowWidthTop, 0.5);
        var mesh = new THREE.Mesh(hilt, m);
        var meshPeak = new THREE.Mesh(peak,m);
        var mat = new Matrix4().makeScale(1, this.meshScale*flowSize, 1);
        mesh.applyMatrix4(mat);
        meshPeak.applyMatrix4(mat);
        meshPeak.position.y += (this.meshScale*flowSize)/2;
      }
  
      //Postionning the objects
      //BEWARE : in the input data, coords are (lat, lon), but here it is all (lon, lat), since X is lon and Y is lat
      var cooWebMerca = proj4(proj4326, proj3857, [point.lon, point.lat]);
      var goodCoords = this.threeViewer.getWorldCoords(cooWebMerca);
  
      //Creating the flow
      var flow = new THREE.Group();
      flow.add(mesh);

      if (meshType == "Arrow"){ // adding supplementary Meshes
        flow.add(meshPeak);
      }

      // Now that the Meshes have been scaled, we can orientate them
      this.orientateMesh(flow, point.u, point.v, point.w, flowSize);

      // Quite arbitrary : allows very simply to differentiate flows in the street and in the sky
      // Must be modified 
      if (point.z > 50){
        flow.name = "skyFlow";
      }
      else{
        flow.name = "flow";
      }
  
      flow.initPosX = goodCoords[0]; //initial and real longitude
      flow.initPosY = goodCoords[1]; //initial and real latitude
      flow.initPosZ = point.z; //initial and real altitude
      flow.currentZ = point.z; //real graphical altitude (useful for height noise and height modifier)
      flow.position.x = goodCoords[0]; //current longitude
      flow.position.y = goodCoords[1]; //current latitude
      flow.position.z = point.z //current altitude
      flow.speedX = point.u; //longitude speed
      flow.speedY = point.v; //latitude speed
      flow.speedZ = point.w; //altitude speed
      flow.size = flowSize; //real size
      flow.currentScale = this.meshScale; //graphical scale
      flow.currentWidth = this.meshWidth //width of arrows and cylinders
      flow.rg = point.rg; //relative size
  
      this.threeViewer.scene.add(flow);
  
    }.bind(this)); 
  
    //TESTS WITH CURVES -> Uncomment all this section if the curve visualisation is to be tested again
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
      this.threeViewer.scene.add( handle );
  
    }
    const curve = new THREE.CatmullRomCurve3(curveHandles.map((handle) => handle.position));
    curve.curveType = "centripetal";
    //curve.closed = true;
  
    const points = curve.getPoints( 50 );
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints( points ),
      new THREE.LineBasicMaterial({color: "black"})
    );
  
    this.threeViewer.scene.add( line );
  
    //geometry to be placed along the curve
    var rect = new THREE.SphereBufferGeometry(5,8,6);
  
    //rect.rotateY(-Math.PI/2);
  
    const objectToCurve = new THREE.Mesh(rect, new THREE.MeshStandardMaterial({color: 0x99ffff}));
    objectToCurve.name = "toBeMoved";
    const flowLine = new Flow(objectToCurve);
  
    flowLine.updateCurve(0, curve);
    flowLine.name = "curve";
    this.threeViewer.scene.add(flowLine.object3D);
  
    return flowLine;
    */
  
    return null;
  }

  changeFlowDensity(zoomLevel){

    //This function is called when a zoom change is triggered and all the flows have to be replaced.

    //Storing scene objects which are not flows
    var stockData = [];
    this.threeViewer.scene.traverse(function(obj){
      if (obj.name != "flow" && obj.name != "skyFlow" && obj.name == "" && !(obj instanceof THREE.Scene) && !(obj instanceof THREE.Mesh)){
        console.log(obj);
        stockData.push(obj);
      }
    });
    
    //Emptying the scene
    this.threeViewer.scene.clear();

    //Re-adding the saved objects
    stockData.forEach(function(obj){
      this.threeViewer.scene.add(obj);
    }.bind(this));

    stockData = [];

    //Re-adding the new objects with a different zoom level
    this.addObjects(zoomLevel, this.meshType);

  }
}
