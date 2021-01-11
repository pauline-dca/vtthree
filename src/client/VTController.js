import { VTThreeViewer, RENDER_MODE } from "./VTThreeViewer";
import * as THREE from "three";
import { OLViewer, IGN_STYLES } from "./OLViewer";
import Feature from "ol/Feature";
import { ZOOM_RES_L93 } from "./Utils";
import { Euler, Vector3 } from "three";
import { distance } from "@turf/turf";


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
    flowLine
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
    this.flowLine = flowLine;
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
    /*this.olViewer = await new OLViewer(
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

    if (this.tileZoom) {
      this.threeViewer.renderer.domElement.addEventListener("wheel", event => {
        console.log("wheeeel ");
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
      if (flow.name == "flow"){

        //NECESSARY LOCAL VARIABLES
        var cylinder = flow.children[0];

        var quaternion = new THREE.Quaternion();
        cylinder.getWorldQuaternion(quaternion);
        var euler_rot = new THREE.Euler().setFromQuaternion(quaternion);

        var scale = new THREE.Vector3();
        cylinder.getWorldScale(scale);

        //RESETING POSITION IF NECESSARY

        var currentDistanceFromInit = Math.sqrt((flow.initPosX - flow.position.x)**2 + (flow.initPosY - flow.position.y)**2);
        if (currentDistanceFromInit >= scale.y){
          flow.position.x = flow.initPosX;
          flow.position.y = flow.initPosY;
          currentDistanceFromInit = 0;
        }

        
        
        //MOVEMENT HANDLING
        if (0 < euler_rot.z < Math.PI/2){ //quart haut gauche dessin donc HAUT DROIT cercle trigo
          var deltaX = -scale.y/50*Math.sin(euler_rot.z);
          var deltaY = scale.y/50*Math.cos(euler_rot.z);
        }
        /*
        else if (Math.PI/2 < euler_rot.z < Math.PI){ //quart bas gauche dessin donc HAUT GAUCHE cercle trigo
          var deltaX = -scale.y/100*Math.cos(euler_rot.z - Math.PI/2);
          var deltaY = scale.y/100*Math.sin(euler_rot.z - Math.PI/2);
        }
        else if (Math.PI < euler_rot.z < 3*Math.PI/2){ //BAS GAUCHE cercle trigo
          var deltaX = scale.y/100*Math.sin(euler_rot.z - Math.PI);
          var deltaY = -scale.y/100*Math.cos(euler_rot.z - Math.PI);
        }
        else{ //BAS DROIT cercle trigo
          var deltaX = scale.y/100*Math.sin(Math.PI*2 - euler_rot.z);
          var deltaY = scale.y/100*Math.cos(Math.PI*2 - euler_rot.z);
        }*/

        //on utilise le log10(scale.y) pour adapter la vitesse de déplacement du flux à la vitesse réelle du vent tout en pondérant par le log
        //pour éviter de trop gros écarts de vitesses et une visualisation anarchique
        flow.position.x += Math.log10(scale.y)*deltaX;
        flow.position.y += Math.log10(scale.y)*deltaY;

        //OPACITY HANDLING (OPACITY = FUNCTION OF POSITION... STRANGELY ENOUGH)
        
        if (currentDistanceFromInit < scale.y/2){ //phase ascendante d'opacité
          flow.children[0].material.opacity = 1.05 + (currentDistanceFromInit - scale.y/2)/(scale.y/2)
          flow.children[1].material.opacity = 1.05 + (currentDistanceFromInit - scale.y/2)/(scale.y/2)

        }
        else{ //phase descendante d'opacité
          flow.children[0].material.opacity = 1.05 - (currentDistanceFromInit - scale.y/2)/(scale.y/2)
          flow.children[1].material.opacity = 1.05 - (currentDistanceFromInit - scale.y/2)/(scale.y/2)
        }
      }
    });

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
}
