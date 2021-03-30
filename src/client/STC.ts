import * as Utils from "./Utils";
import * as d3 from "d3";
import * as d3hexbin from "d3-hexbin";
import proj4 from "proj4";
import { proj4326, proj3857 } from "./Utils";
import * as THREE from "three";
import { zoom } from "d3-zoom";
import helvetiker from "../../node_modules/three/examples/fonts/helvetiker_regular.typeface.json";

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
  selected: THREE.Mesh;
  currentDates: { min: number; max: number };
  startDate: any;
  scaleGroup: THREE.Group;
  constructor(data, startDate, controller, zoomValues, infoPanel) {
    this.temporalScale = 300;
    this.currentDates = { min: 0, max: 100 };
    this.controller = controller;
    this.zoomValues = zoomValues;
    this.infoPanel = infoPanel;
    this.hexGroups = new Map();
    this.zoomLevel = 3;
    this.startDate = startDate;
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
      let indexPositionsMap = new Map();
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
              indexPositionsMap.set(currentIndex, { x: value.x, y: value.y });
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
        this.currentDates,
        indexPositionsMap
      );
      this.hexGroups.set(zoomValue.index, hexagonGroup);
      this.controller.threeViewer.scene.add(hexagonGroup.group);
      this.controller.threeViewer.scene.add(hexagonGroup.floorGroup);
    }
    this.addAxis();
    this.hexGroups.get(this.zoomLevel).floorGroup.visible = true;
    this.hexGroups.get(this.zoomLevel).group.visible = true;
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
    } else {
      this.select(null, event);
    }
  }

  select(hex: THREE.Mesh, event) {
    if (hex != null) {
      if (this.selected != null && this.selected != hex) {
        this.selected.material.emissive.setHex(this.selected.userData.color);
      }
      if (hex.userData.type == "hex") {
        hex.material.emissive.setHex(0xff0000);
        //Display informations about the object
        this.infoPanel.innerHTML =
          "Date : " + Utils.addDaysToDate(this.startDate, hex.userData.date);
        if (this.hexGroups.get(this.zoomLevel).daysAggregation > 1) {
          this.infoPanel.innerHTML =
            "Date : " +
            Utils.addDaysToDate(this.startDate, hex.userData.date) +
            "-" +
            Utils.addDaysToDate(
              this.startDate,
              hex.userData.date +
                this.hexGroups.get(this.zoomLevel).daysAggregation
            );
        }
        // if (hex.userData.endDate != undefined) {
        //   this.infoPanel.innerHTML =
        //     "Date : " + hex["name"] + "-" + hex.userData.endDate;
        // }
        this.infoPanel.style.left = event.clientX + 20 + "px";
        this.infoPanel.style.top = event.clientY - 5 + "px";
        this.infoPanel.style.visibility = "visible";
        this.hexGroups.get(this.zoomLevel).select(hex.userData.hexid);
        this.selected = hex;
      }
    } else {
      if (this.selected != null) {
        this.selected.material.emissive.setHex(this.selected.userData.color);
        this.infoPanel.style.visibility = "hidden";
        this.selected = null;
        this.hexGroups.get(this.zoomLevel).select(-1);
      }
    }
  }

  setCurrentDates(currentDates: { min: number; max: number }) {
    this.currentDates = currentDates;
    this.controller.threeViewer.scene.remove(
      this.hexGroups.get(this.zoomLevel).group
    );
    // for (let children of this.hexGroups.get(this.zoomLevel).group.children) {
    //   this.controller.threeViewer.scene.remove(children);

    //   this.hexGroups.get(this.zoomLevel).group.remove(children);
    // }
    this.hexGroups.forEach(hexGroup => {
      hexGroup.updateMeshes(this.temporalScale, this.currentDates);
      this.controller.threeViewer.scene.add(hexGroup.group);
    });
    this.addAxis();
  }

  addAxis() {
    const loader = new THREE.FontLoader();
    var font = loader.parse(helvetiker);
    if (this.scaleGroup != null) {
      this.controller.threeViewer.scene.remove(this.scaleGroup);
    }
    this.scaleGroup = new THREE.Group();
    let timeScale = d3
      .scaleLinear()
      .domain([0, this.temporalScale])
      .range([this.currentDates.min, this.currentDates.max]);

    var nbrLegends = 6; // Nbr of texts forming the temporal legend
    for (let i = 0; i <= nbrLegends; i++) {
      let date = timeScale((i * this.temporalScale) / nbrLegends);
      let dateString = Utils.addDaysToDate(this.startDate, date);
      const axegeometry = new THREE.TextGeometry(dateString + "__", {
        font: font,
        size: 16,
        height: 5,
        curveSegments: 50,
        bevelEnabled: false,
        bevelThickness: 5,
        bevelSize: 1,
        bevelOffset: 0,
        bevelSegments: 5
      });

      var axematerial = new THREE.MeshStandardMaterial({ color: 0x000000 });
      var axe = new THREE.Mesh(axegeometry, axematerial); //a three js mesh needs a geometry and a material
      axe.position.x = -1000;
      axe.position.y = -70;
      axe.position.z = (i * this.temporalScale) / nbrLegends + 3;
      this.scaleGroup.add(axe); //all objects have to be added to the threejs scene
    }
    this.controller.threeViewer.scene.add(this.scaleGroup); //the group is added to the scene
  }

  setTemporalScale(temporalScale) {
    this.temporalScale = temporalScale;
    this.hexGroups.forEach((hexGroup, zoomLevel) => {
      hexGroup.updateTemporalScale(temporalScale);
    });
    this.addAxis();
  }

  render(cameraDistance) {
    for (let zoomValue of this.zoomValues) {
      if (
        cameraDistance < zoomValue.endDistance &&
        cameraDistance >= zoomValue.startDistance
      ) {
        if (this.zoomLevel != zoomValue.index) {
          this.zoomLevel = zoomValue.index;
          this.hexGroups.forEach((hexGroup, index) => {
            if (index == this.zoomLevel) {
              hexGroup.group.visible = true;
              hexGroup.floorGroup.visible = true;
            } else {
              hexGroup.group.visible = false;
              hexGroup.floorGroup.visible = false;
            }
          });
        }
      }
    }
    // this.scaleGroup.quaternion.copy(
    //   this.controller.threeViewer.currentCamera.quaternion
    // );
    for (let element of this.scaleGroup.children) {
      element.quaternion.copy(
        this.controller.threeViewer.currentCamera.quaternion
      );
    }
  }
}

export class HexagonGroup {
  radius: number;
  daysAggregation: number;
  group: THREE.Group;
  floorGroup: THREE.Group;
  positionsMap: any;
  positionsIndexMap: Map<number, Map<number, number>>;
  indexPositionsMap: Map<number, { x: number; y: number }>;
  meshMap: Map<number, Map<number, THREE.Mesh[]>>;
  floorMeshMap: Map<number, Map<number, THREE.Mesh>>;
  currentDates: { min: number; max: number };
  maxDate: number;
  maxValue: any;
  constructor(
    radius,
    daysAggregation,
    positionsMap,
    temporalScale,
    positionsIndexMap,
    currentDates,
    indexPositionsMap
  ) {
    this.radius = radius;
    this.daysAggregation = daysAggregation;
    this.group = new THREE.Group();
    this.floorGroup = new THREE.Group();
    this.positionsIndexMap = positionsIndexMap;
    this.indexPositionsMap = indexPositionsMap;
    this.positionsMap = positionsMap;
    this.currentDates = currentDates;
    this.maxDate = 100;

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

  select(hexIndex) {
    if (hexIndex != -1) {
      let position = this.indexPositionsMap.get(hexIndex);

      this.meshMap.forEach((yMap, xPos) => {
        yMap.forEach((meshes, yPos) => {
          for (let mesh of meshes) {
            if (!(xPos == position.x && yPos == position.y)) {
              mesh.material.opacity = 0.1;
            } else {
              console.log(mesh.userData.type);
              mesh.material.opacity = 1.0;
            }
          }
        });
      });
      this.floorMeshMap.forEach((yMap, xPos) => {
        yMap.forEach((mesh, yPos) => {
          if (!(xPos == position.x && yPos == position.y)) {
            mesh.material.opacity = 0.1;
          } else {
            console.log(mesh.userData.type);
            mesh.material.opacity = 0.5;
          }
        });
      });
    } else {
      this.meshMap.forEach((yMap, xPos) => {
        yMap.forEach((meshes, yPos) => {
          for (let mesh of meshes) {
            mesh.material.opacity = 1.0;
          }
        });
      });
      this.floorMeshMap.forEach((yMap, xPos) => {
        yMap.forEach((mesh, yPos) => {
          mesh.material.opacity = 0.1;
        });
      });
    }
  }

  createMeshes(temporalScale) {
    let dates = [];
    for (
      let i = this.currentDates.min;
      i < this.currentDates.max;
      i += this.daysAggregation
    ) {
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
      .domain([this.currentDates.min, this.currentDates.max])
      .range([0, temporalScale]);
    let colorScale = d3.scaleQuantize([0, maxValue.value], d3.schemeGreens[9]);

    let meshMap = new Map();
    this.floorMeshMap = new Map();
    aggregatedMap.forEach((xMap, date) => {
      let z = timeScale(date);
      xMap.forEach((yMap, xPos) => {
        yMap.forEach((value, yPos) => {
          if (value != 0) {
            let radius = Utils.rforHexagonArea(areaScale(value));
            var geometry = new THREE.CylinderBufferGeometry(
              radius,
              radius,
              //(temporalScale / this.maxDate) * this.daysAggregation,
              1,
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
            cylinder.scale.setY(
              (temporalScale /
                (this.currentDates.max - this.currentDates.min)) *
                this.daysAggregation
            );
            //dateToAlti(hexDataDate) + (3 * nbrDaysAgregation) / 2;
            // cylinder.name = hexDataDate;
            cylinder.userData.hexid = this.positionsIndexMap
              .get(xPos)
              .get(yPos);
            cylinder.userData.type = "hex";
            cylinder.userData.color = colorMesh;
            cylinder.userData.date = date;
            if (this.daysAggregation > 1) {
              // cylinder.userData.endDate = Utils.addDaysToDate(
              //   hexDataDate,
              //   nbrDaysAgregation
              // );
            }
            if (meshMap.get(xPos) == null) {
              meshMap.set(xPos, new Map());
            }
            if (meshMap.get(xPos).get(yPos) == null) {
              meshMap.get(xPos).set(yPos, []);
            }

            meshMap
              .get(xPos)
              .get(yPos)
              .push(cylinder);
            this.group.add(cylinder);
          }
        });
      });
    });
    this.meshMap = meshMap;
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
        var materialGrid = new THREE.MeshStandardMaterial({ color: "green" });
        materialGrid.transparent = true;
        materialGrid.opacity = 0.2;
        const mesh = new THREE.Mesh(shape3d, materialGrid);
        mesh.position.x = xPos;
        mesh.position.y = yPos;
        mesh.position.z = 0.1;
        mesh.rotation.z = Math.PI / 2;
        mesh.renderOrder = 1;
        mesh.userData.floorId = index;
        mesh.userData.type = "floor";
        this.floorGroup.add(mesh);
        if (this.floorMeshMap.get(xPos) == null) {
          this.floorMeshMap.set(xPos, new Map());
        }
        this.floorMeshMap.get(xPos).set(yPos, mesh);
        // if (this.meshMap.has(xPos) && this.meshMap.get(xPos).has(yPos)) {
        //   this.meshMap
        //     .get(xPos)
        //     .get(yPos)
        //     .push(mesh);
        // }

        let line = new THREE.Line(
          geometryPoints,
          new THREE.LineBasicMaterial({ color: "black", linewidth: 4 })
        );
        line.rotation.z = Math.PI / 2;
        line.position.x = xPos;
        line.position.y = yPos;
        line.position.z = 0.1;
        line.renderOrder = 2;
        line.userData.type = "floor";
        this.floorGroup.add(line);
        // this.meshMap
        //   .get(xPos)
        //   .get(yPos)
        //   .push(line);
      });
    });
    this.group.visible = false;
    this.floorGroup.visible = false;
  }

  updateMeshes(temporalScale, currentDates) {
    // for (let children of this.group.children) {
    //   this.group.remove(children);
    // }
    this.group = new THREE.Group();
    this.currentDates = currentDates;
    let dates = [];
    for (
      let i = this.currentDates.min;
      i < this.currentDates.max;
      i += this.daysAggregation
    ) {
      dates.push(i);
    }

    let aggregatedMap = this.temporalAggregation(dates, this.positionsMap);
    this.maxValue = this.getMaxValue(aggregatedMap);
    let maxArea = Utils.hexagonArea(this.radius);
    let areaScale = d3
      .scaleLinear()
      .domain([0, this.maxValue.value])
      .range([0, maxArea]);

    let timeScale = d3
      .scaleLinear()
      .domain([this.currentDates.min, this.currentDates.max])
      .range([0, temporalScale]);
    let colorScale = d3.scaleQuantize(
      [0, this.maxValue.value],
      d3.schemeGreens[9]
    );

    let meshMap = new Map();
    aggregatedMap.forEach((xMap, date) => {
      let z = timeScale(date);
      xMap.forEach((yMap, xPos) => {
        yMap.forEach((value, yPos) => {
          if (value != 0) {
            let radius = Utils.rforHexagonArea(areaScale(value));
            var geometry = new THREE.CylinderBufferGeometry(
              radius,
              radius,
              //(temporalScale / this.maxDate) * this.daysAggregation,
              1,
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
            cylinder.scale.setY(
              (temporalScale /
                (this.currentDates.max - this.currentDates.min)) *
                this.daysAggregation
            );
            //dateToAlti(hexDataDate) + (3 * nbrDaysAgregation) / 2;
            // cylinder.name = hexDataDate;
            cylinder.userData.hexid = this.positionsIndexMap
              .get(xPos)
              .get(yPos);
            cylinder.userData.type = "hex";
            cylinder.userData.color = colorMesh;
            cylinder.userData.date = date;
            if (this.daysAggregation > 1) {
              // cylinder.userData.endDate = Utils.addDaysToDate(
              //   hexDataDate,
              //   nbrDaysAgregation
              // );
            }
            if (meshMap.get(xPos) == null) {
              meshMap.set(xPos, new Map());
            }
            if (meshMap.get(xPos).get(yPos) == null) {
              meshMap.get(xPos).set(yPos, []);
            }

            meshMap
              .get(xPos)
              .get(yPos)
              .push(cylinder);
            this.group.add(cylinder);
          }
        });
      });
    });
    this.group.visible = false;
    this.meshMap = meshMap;
  }

  updateTemporalScale(temporalScale) {
    let timeScale = d3
      .scaleLinear()
      .domain([this.currentDates.min, this.currentDates.max])
      .range([0, temporalScale]);
    this.meshMap.forEach((yMap, xPos) => {
      yMap.forEach((meshes, ypos) => {
        for (let mesh of meshes) {
          let z = timeScale(mesh.userData.date);
          mesh.position.z = z;
          mesh.scale.setY(
            (temporalScale / (this.currentDates.max - this.currentDates.min)) *
              this.daysAggregation
          );
        }
      });
    });
  }
}
