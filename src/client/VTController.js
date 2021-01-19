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

//From-index.js imports
import { CylinderBufferGeometry, Matrix4, SphereBufferGeometry } from "three";
import "regenerator-runtime/runtime";
import proj4 from "proj4";
import { proj4326, proj3857 } from "./Utils";



export class VTController {
  constructor(
    width,
    height,
    center,
    zoom,
    layers,
    renderMode,
    style,
    tileZoom,
    paramsGUI
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
    this.flowLine = paramsGUI.flowLine;
    this.baseSpeed = paramsGUI.speedFlux;
    this.opaciteMax = paramsGUI.opaciteMax;
    this.opaciteMin = paramsGUI.opaciteMin;
    this.reposFlux = paramsGUI.newPosFlux;
    this.typeFourchette = paramsGUI.typeFourchette;
    this.enableDifferentScale = paramsGUI.enableDifferentScale;
    this.typeMesh = paramsGUI.typeMesh;
    this.tailleMesh = paramsGUI.tailleMesh;
  }

  async init(center, zoom, renderMode, style, tileZoom) {
    this.threeViewer = new VTThreeViewer(
      this.width,
      this.height,
      "white",
      !tileZoom,
      center,
      ZOOM_RES_L93[zoom]
    );

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
    /*this.threeViewer.scene.traverse(function(obj){
      console.log(obj);
    });*/


    this.currentZoomLevel = 3

    this.threeViewer.renderer.domElement.addEventListener("wheel", event => {
 
      var zoom = this.threeViewer.controls.target.distanceTo(this.threeViewer.controls.object.position);
      
      var instantZoomLevel = this.currentZoomLevel;
      if (zoom > 1000){
        instantZoomLevel = 3;
      }
      else if (zoom > 600){
        instantZoomLevel = 2;
      }
      else{
        instantZoomLevel = 1;
      }
      if (instantZoomLevel != this.currentZoomLevel){ //zoom level changed !
        
        this.currentZoomLevel = instantZoomLevel;
        if (this.enableDifferentScale == "Adapté"){
          this.changeFlowDensity(instantZoomLevel);
        }
      }
    });

    /*
    if (this.tileZoom) {
      this.threeViewer.renderer.domElement.addEventListener("wheel", event => {
        //console.log("wheeeel ");
        self.zoomOlViewer(event);
      });
    }*/

    this.render();
  }

  render() {
    if (this.tileZoom && this.state.loading != 0) {
      console.log("render ol!");
      var mapContainer = document.getElementById("map");
      var mapCanvas = mapContainer.getElementsByTagName("canvas")[0];
      this.threeViewer.setPlaneTexture(mapCanvas);
    }

    //PLACING & ANIMATING FLOWS
    this.threeViewer.scene.traverse (function (flow){
      if (flow.name == "flow" || flow.name == "skyFlow"){

        var scale = flow.size

        //CHANGE THIS FOR DISTANCE/LENGHT OF LIFE PARAM
        var coef = 1;
        
        var currentDistanceFromInit = Math.sqrt((flow.initPosX - flow.position.x)**2 + (flow.initPosY - flow.position.y)**2 + (flow.currentZ - flow.position.z)**2);
        if (currentDistanceFromInit >= coef*scale){

          //les ajouts aléatoires sont très importants et jouent bcp sur le rendu (à supprime si mieux quand très fluide).
          //ils apportent un léger décalagage spatial pour donner plus de naturel, et du coup un décalage temporel (car la distance
          // à l'origine n'est plus toujours la même, ce qui évite l'effet "hypnotisant", "déjà vu", "répétitif")
          // mais cela brouille un peu aussi la donnée, c'est légèrement moins clair

          if (this.typeFourchette == 0){
            var refPosZ = flow.initPosZ;
          }
          else if (this.typeFourchette > 0){
            var refPosZ = flow.currentZ;
          }

          if (this.reposFlux == "Fixe"){
            flow.position.x = flow.initPosX;
            flow.position.y = flow.initPosY;
          }
          else if (this.reposFlux == "Aléatoire"){
            flow.position.x = flow.initPosX + scale*Math.random()/2; 
            flow.position.y = flow.initPosY + scale*Math.random()/2;
          }
          flow.position.z = refPosZ;
          currentDistanceFromInit = 0;
        }

        
        //MOVEMENT HANDLING

        //console.log(this.baseSpeed);
        var deltaX = flow.speedX*this.baseSpeed;
        var deltaY = flow.speedY*this.baseSpeed;
        var deltaZ = flow.speedZ*this.baseSpeed;

        flow.position.x += deltaX;
        flow.position.y += deltaY;
        flow.position.z += deltaZ;

        //OPACITY HANDLING (OPACITY = FUNCTION OF POSITION... STRANGELY ENOUGH)
        
        if (currentDistanceFromInit < coef*scale/2){ //phase ascendante d'opacité
          flow.children[0].material.opacity = this.opaciteMax + (currentDistanceFromInit - coef*scale/2)/(coef*scale/2) + this.opaciteMin;

        }
        else{ //phase descendante d'opacité
          flow.children[0].material.opacity = this.opaciteMax - (currentDistanceFromInit - coef*scale/2)/(coef*scale/2) + this.opaciteMin;
        }
      }
    }.bind(this));

    if (this.flowLine){
      this.flowLine.moveAlongCurve(0.01);
    }




    this.threeViewer.animate();
    requestAnimationFrame(function() {
      this.render();
    }.bind(this)); 
  }

  loadVTile() {
    return new Promise(function(resolve, reject) {
      this.olViewer.layer.getSource().on("tileloadend", resolve);
    });
  }

  zoomOlViewer(event) {
    console.log("zoooooom!");
    //var zoom = controls.target.distanceTo( controls.object.position )
    //console.log(this.threeViewer.controls.target.distanceTo(this.threeViewer.controls.object.position));
    //this.olViewer.domElement.dispatchEvent(
    /*this.olViewer.map.getViewport().dispatchEvent(
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
    );*/
    event.preventDefault();
  }

  loadTileFeatures(evt) {
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
    mesh.applyMatrix4(new Matrix4().makeScale(1, length, 1));
    mesh.rotateOnWorldAxis(new THREE.Vector3(1,0,0), Math.atan(speedZ/length)); //rotation X (direction haut bas)
  
    //Rotation handling :
    //console.log(speedX, speedY);
    
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
  
  addObjects(zoomLevel, meshType) {

    console.log(zoomLevel);

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
    
    windData.forEach(function(point){
      
      //Initial buffer geometries
  
      var m = new THREE.MeshStandardMaterial({color : "black", opacity: 1, transparent: true});
      var flowSize = Math.sqrt(point.u**2 + point.v**2 + point.w**2);
  
      if (meshType == "Cylindre"){ //ATTENTION ! FAUT ADAPTER TOUTE CETTE FONCTION AUX CHANGEMENTS DE ZOOM, POUR QUE LES PARAMS DU MENU SOIENT PRIS EN COMPTE
        var flowWidthTop = 0.2*(2**zoomLevel);
        var flowWidthBottom = 0.01;
        var p = new THREE.CylinderBufferGeometry(flowWidthTop, flowWidthBottom);
        var mat = new Matrix4().makeScale(1, this.tailleMesh, 1);
        var mesh = new THREE.Mesh(p, m);
        mesh.applyMatrix4(mat);
        this.orientateMesh(mesh, point.u, point.v, point.w, flowSize);
      }
      else if (meshType == "Sphere"){
        var p = new THREE.SphereBufferGeometry(this.tailleMesh);
        var mesh = new THREE.Mesh(p, m);

      }

  
      // Some main parameters for the flows, to be modified depending on the context...

  
      //Postionning the objects
      var cooWebMerca = proj4(proj4326, proj3857, [point.lon, point.lat]);
      var goodCoords = this.threeViewer.getWorldCoords(cooWebMerca);
  
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
      flow.currentScale = this.tailleMesh;
  
      this.threeViewer.scene.add(flow);
  
    }.bind(this)); 
  
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

  //AJOUT NATHAN : PERMET D'ADAPTER LE NOMBRE DE FLUX VISIBLES SELON LE NIVEAU DE ZOOM
  async changeFlowDensity(zoomLevel){
    
    this.threeViewer.scene.traverse(function(obj){
      if (obj.name == "flow" || obj.name == "skyFlow"){

        if (obj.children.length > 0){
          obj.children[0].geometry.dispose();
          obj.children[0].material.dispose();
          this.threeViewer.scene.remove(obj.children[0]);
          obj.remove(obj.children[0]);
          if (obj instanceof THREE.Group){
            this.threeViewer.scene.remove(obj);
          }
        }
      }
    }.bind(this));
    
    this.threeViewer.scene.clear();
    this.addObjects(zoomLevel, this.typeMesh);

  }
}
