import * as Utils from "./Utils";
import * as d3 from "d3";
import * as d3hexbin from "d3-hexbin";
import proj4 from "proj4";
import { proj4326, proj3857 } from "./Utils";
import * as THREE from "three";
import { zoom } from "d3-zoom";

export class SpatioTemporalCube {
  data: Map<number, Map<any, number>>;
  hexGroups: Map<number, HexagonGroup>;
  temporalScale: number;
  zoomLevel: number;
  controller: any;
  zoomValues: {
    radius: number;
    daysAggregation: number;
    startDistance: number;
    endDistance: number;
    index: number;
  }[];
  maxDate: number;
  infoPanel: HTMLElement;
  constructor(data, startDate, controller, zoomValues, infoPanel) {
    this.temporalScale = 300;
    this.controller = controller;
    this.zoomValues = zoomValues;
    this.infoPanel = infoPanel;
    this.hexGroups = new Map();
    this.zoomLevel = 0;
    this.processData(data, startDate, zoomValues);
  }

  processData(data, startDate, zoomValues) {
    let datesMap = new Map<number, any>();
    let startDateDate = new Date(startDate);
    for (let event of data) {
      let diffDays = Utils.getDiffDate(startDateDate, new Date(event.date));
      if (!datesMap.has(diffDays)) {
        datesMap.set(diffDays, []);
      }
      let coords = proj4(proj4326, proj3857, [event.lon, event.lat]);
      let worldCoords = this.controller.threeViewer.getWorldCoords(coords);
      let clonedEvent = {
        x: worldCoords[0],
        y: worldCoords[1],
        date: event.date
      };
      datesMap.get(diffDays).push(clonedEvent);
    }

    let maxDate = -Number.MAX_VALUE;
    datesMap.forEach((event, date) => {
      if (date > maxDate) {
        maxDate = date;
      }
    });
    this.maxDate = maxDate;

    //let extent = this.getDataExtent(datesMap);

    for (let i = 0; i < zoomValues.length; i++) {
      let zoomValue = zoomValues[i];
      let hexMap = new Map();
      // let pointGrid = this.getPointGrid(
      //   zoomValue.radius,
      //   Math.floor(extent.maxX - extent.minX) + 1000,
      //   Math.floor(extent.maxY - extent.minY) + 1000
      // );
      datesMap.forEach((values, date) => {
        // let mergedPoints = pointGrid.concat(values);
        let hexbin = d3hexbin
          .hexbin()
          .radius(zoomValue.radius)
          .x(function(d) {
            return d.x;
          })
          .y(function(d) {
            return d.y;
          });

        var hexPoints = hexbin(values);
        hexMap.set(date, hexPoints);
      });
      let positions = [];
      let positionsMap = new Map();
      let positionsIndexMap = new Map();
      let currentIndex = 0;
      hexMap.forEach((values, date) => {
        for (let value of values) {
          if (value.length > 0) {
            if (!positionsMap.has(value.x)) {
              positionsMap.set(value.x, new Map());
            }
            if (!positionsIndexMap.has(value.x)) {
              positionsIndexMap.set(value.x, new Map());
            }
            if (!positionsMap.get(value.x).has(value.y)) {
              positionsMap.get(value.x).set(value.y, new Map());
            }
            if (!positionsIndexMap.get(value.x).has(value.y)) {
              positionsIndexMap.get(value.x).set(value.y, currentIndex);
              currentIndex++;
            }
            positionsMap
              .get(value.x)
              .get(value.y)
              .set(date, value.length);
          }
        }
      });
      let hexagonGroup = new HexagonGroup(
        zoomValue.radius,
        zoomValue.daysAggregation,
        positionsMap,
        this.temporalScale,
        positionsIndexMap,
        maxDate
      );
      this.hexGroups.set(zoomValue.index, hexagonGroup);
      this.controller.threeViewer.scene.add(hexagonGroup.group);
    }
  }

  click(event) {
    let x = (event.clientX / window.innerWidth) * 2 - 1;
    let y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.controller.threeViewer.rayCaster.setFromCamera(
      new THREE.Vector2(x, y),
      this.controller.threeViewer.currentCamera
    );
    var intersects = this.controller.threeViewer.rayCaster.intersectObjects(
      this.hexGroups.get(this.zoomLevel).group.children
    );
    if (intersects.length > 0) {
      this.select(intersects[0].object, event);
    }
  }

  select(hex: THREE.Mesh, event) {
    //hex.material.emissive.setHex(hex.currentHex);
    //INTERSECTED = intersects[0].object;
    //INTERSECTED.currentHex = INTERSECTED.material.emissive.getHex();
    hex.material.emissive.setHex(0xff0000);
    //Display informations about the object
    this.infoPanel.innerHTML = "Date : " + hex["date"];
    if (hex.userData.endDate != undefined) {
      this.infoPanel.innerHTML =
        "Date : " + hex["name"] + "-" + hex.userData.endDate;
    }
    this.infoPanel.style.left = event.clientX + 20 + "px";
    this.infoPanel.style.top = event.clientY - 5 + "px";
    this.infoPanel.style.visibility = "visible";
  }
}

export class HexagonGroup {
  radius: number;
  daysAggregation: number;
  group: THREE.Group;
  positionsMap: any;
  positionsIndexMap: any;
  maxDate: number;
  constructor(
    radius,
    daysAggregation,
    positionsMap,
    temporalScale,
    positionsIndexMap,
    maxDate
  ) {
    this.radius = radius;
    this.daysAggregation = daysAggregation;
    this.group = new THREE.Group();
    this.positionsIndexMap = positionsIndexMap;
    this.positionsMap = positionsMap;
    this.maxDate = maxDate;
    this.createMeshes(temporalScale);
  }

  temporalAggregation(dates, positionsMap) {
    //Return the number of case on a same location during some days
    let aggregatedMap = new Map();
    for (let date of dates) {
      aggregatedMap.set(date, new Map());
      let positions = [];
      for (let i = 0; i < this.daysAggregation; i++) {
        positionsMap.forEach((YposMap, xPosvalue) => {
          if (aggregatedMap.get(date).get(xPosvalue) == null) {
            aggregatedMap.get(date).set(xPosvalue, new Map());
          }
          YposMap.forEach((datesMap, yposvalue) => {
            if (datesMap.get(date + i) != null) {
              if (
                aggregatedMap
                  .get(date)
                  .get(xPosvalue)
                  .get(yposvalue) == null
              ) {
                aggregatedMap
                  .get(date)
                  .get(xPosvalue)
                  .set(yposvalue, 0);
              }
              aggregatedMap
                .get(date)
                .get(xPosvalue)
                .set(
                  yposvalue,
                  aggregatedMap
                    .get(date)
                    .get(xPosvalue)
                    .get(yposvalue) + datesMap.get(date + i)
                );
            }
          });
        });
      }
    }
    return aggregatedMap;
  }

  getMaxValue(datesMap) {
    let maxValue = -Number.MAX_VALUE;
    let maxDate = null;
    let maxX = null;
    let maxY = null;
    datesMap.forEach((xPosMap, date) => {
      xPosMap.forEach((yPosMap, xPosValue) => {
        yPosMap.forEach((value, yPosvalue) => {
          if (value >= maxValue) {
            maxValue = value;
            maxDate = date;
            maxX = xPosValue;
            maxY = yPosvalue;
          }
        });
      });
    });
    return { value: maxValue, date: maxDate, x: maxX, y: maxY };
  }

  createMeshes(temporalScale) {
    var materialGrid = new THREE.MeshStandardMaterial({ color: "green" });
    materialGrid.transparent = true;
    materialGrid.opacity = 0.2;
    let dates = [];
    for (let i = 0; i < 100; i += this.daysAggregation) {
      dates.push(i);
    }

    let aggregatedMap = this.temporalAggregation(dates, this.positionsMap);
    let maxValue = this.getMaxValue(aggregatedMap);
    // var hexData = hexDatabyDate(databyDate, pointGrid);
    // let max = setBoudaries(hexData, dates);
    let maxArea = Utils.hexagonArea(this.radius);
    let areaScale = d3
      .scaleLinear()
      .domain([0, maxValue.value])
      .range([0, maxArea]);

    let timeScale = d3
      .scaleLinear()
      .domain([0, this.maxDate])
      .range([0, temporalScale]);
    let colorScale = d3.scaleQuantize([0, maxValue.value], d3.schemeGreens[9]);

    aggregatedMap.forEach((xMap, date) => {
      let z = timeScale(date);
      xMap.forEach((yMap, xPos) => {
        yMap.forEach((value, yPos) => {
          if (value != 0) {
            let radius = Utils.rforHexagonArea(areaScale(value));
            var geometry = new THREE.CylinderBufferGeometry(
              radius,
              radius,
              (temporalScale / this.maxDate) * this.daysAggregation,
              6
            ); // Area proportional to the number of covid entries, arbitrary height
            var colorMesh = colorScale(value);
            var material = new THREE.MeshStandardMaterial({ color: colorMesh });
            material.transparent = true;
            var cylinder = new THREE.Mesh(geometry, material); //a three js mesh needs a geometry and a material
            cylinder.position.x = xPos;
            cylinder.position.y = yPos;
            cylinder.position.z = z;
            cylinder.rotation.x = Math.PI / 2;
            //dateToAlti(hexDataDate) + (3 * nbrDaysAgregation) / 2;
            // cylinder.name = hexDataDate;
            cylinder.userData.hexid = this.positionsIndexMap
              .get(xPos)
              .get(yPos);
            if (this.daysAggregation > 1) {
              // cylinder.userData.endDate = Utils.addDaysToDate(
              //   hexDataDate,
              //   nbrDaysAgregation
              // );
            }
            this.group.add(cylinder);
          }
        });
      });
    });

    let hex = [];
    for (let i = 1; i <= 6; i++) {
      hex.push([
        this.radius * Math.sin(Math.PI / 6 + i * ((2 * Math.PI) / 6)),
        this.radius * Math.cos(Math.PI / 6 + i * ((2 * Math.PI) / 6))
      ]);
    }

    let shape = new THREE.Shape();
    shape.moveTo(hex[5][0], hex[5][1]);
    for (let i = 0; i < hex.length; i++) {
      shape.lineTo(hex[i][0], hex[i][1]);
    }
    const shape3d = new THREE.ExtrudeGeometry(shape, {
      depth: 0,
      bevelEnabled: false
    });
    const points = shape.getPoints();
    const geometryPoints = new THREE.BufferGeometry().setFromPoints(points);

    this.positionsIndexMap.forEach((yMap, xPos) => {
      yMap.forEach((index, yPos) => {
        const mesh = new THREE.Mesh(shape3d, materialGrid);
        mesh.position.x = xPos;
        mesh.position.y = yPos;
        mesh.position.z = 0.1;
        mesh.rotation.z = Math.PI / 2;
        mesh.renderOrder = 1;
        mesh.userData.floorId = index;
        this.group.add(mesh);

        let line = new THREE.Line(
          geometryPoints,
          new THREE.LineBasicMaterial({ color: "black", linewidth: 4 })
        );
        line.rotation.z = Math.PI / 2;
        line.position.x = xPos;
        line.position.y = yPos;
        line.position.z = 0.1;
        line.renderOrder = 2;
        this.group.add(line);
      });
    });
  }
}
