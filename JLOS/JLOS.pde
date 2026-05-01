////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//declare variables/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
int SCALE = 3; // <-- Change this to 2, 3, or 4 for higher resolution

float[] num;//data from csv 
String[] num2;//data from csv
float[] num3;//data from csv 
int corrH = 30;//corrH=corridor height
int acH = 15;//acH=A/C depth
int lg = 30;//pointer line length
int los;//overall level of service
int SEGMENT_START_ROW = 1;
int SEGMENT_END_ROW = 29;
int TOTAL_ROW = 30;
int LEVEL_LABEL_ROW = 31;
int LEVEL_ELEVATION_ROW = 32;
String DEFAULT_DESTINATION_METRIC_LABEL_POSITION = "right";
float DEFAULT_CANVAS_PADDING_X = 140;
float DEFAULT_CANVAS_PADDING_TOP = 60;
float DEFAULT_CANVAS_PADDING_BOTTOM = 160;
String CANVAS_PADDING_MARKER = "CANVAS PAD>>";
String DEFAULT_CANVAS_RATIO_PRESET = "auto";
float DEFAULT_CANVAS_RATIO_WIDTH = 16;
float DEFAULT_CANVAS_RATIO_HEIGHT = 9;
String CANVAS_RATIO_MARKER = "CANVAS RATIO>>";
float DESTINATION_SUMMARY_LINE_SPACING = 16;
float DESTINATION_SUMMARY_POINT_GAP = 12;
float DESTINATION_SUMMARY_FRAME_PADDING = 12;
float DESTINATION_SUMMARY_DEFAULT_RIGHT_GAP = 28;
float DESTINATION_SUMMARY_ICON_GAP = 12;
PImage img;
PFont f10;
PFont f30;
HashMap<String, PImage> iconCache = new HashMap<String, PImage>();
HashMap<Integer, String> pictogramIconFiles = new HashMap<Integer, String>();
HashMap<Integer, String> pictogramLabels = new HashMap<Integer, String>();

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//dynamic canvas calculation////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
void settings() {
  size(1000, 400); // Standard PDE window requirement (does not affect the saved high-res PNG)
}

void setup() {
f10 = createFont("Consolas", 10); // vector font, sharp at any scale
f30 = createFont("Consolas", 30); // vector font, sharp at any scale
initPictogramMetadata();
String[] data = loadStrings("JLOS_data.csv");
ArrayList<String> validationErrors = validateData(data);
if (validationErrors.size() > 0) {
  renderValidationError(validationErrors);
  exit();
  return;
}

// Extract scale and grid dimensions from row 0. Legacy CSVs may leave grid columns blank.
String[] scaleCells = split(data[0], ",");
float pxPerMeterH = configuredFloat(scaleCells, 1, 1.333333333); // Horizontal pixels per meter
float pxPerMeterV = configuredFloat(scaleCells, 2, 12.5); // Vertical pixels per meter
float gridWidthM = configuredFloat(scaleCells, 3, 75.0);
float gridHeightM = configuredFloat(scaleCells, 4, 4.0);
boolean showLegend = configuredFlag(scaleCells, 7, true);
boolean showOverallLos = configuredFlag(scaleCells, 8, true);
String destinationMetricLabelPosition = configuredMetricLabelPosition(scaleCells, DEFAULT_DESTINATION_METRIC_LABEL_POSITION);
float canvasPaddingX = configuredCanvasPaddingValue(scaleCells, 15, DEFAULT_CANVAS_PADDING_X);
float canvasPaddingTop = configuredCanvasPaddingValue(scaleCells, 16, DEFAULT_CANVAS_PADDING_TOP);
float canvasPaddingBottom = configuredCanvasPaddingValue(scaleCells, 17, DEFAULT_CANVAS_PADDING_BOTTOM);
String canvasRatioPreset = configuredCanvasRatioPreset(scaleCells);
float canvasRatioWidth = configuredCanvasRatioDimension(scaleCells, 20, canvasRatioPresetWidth(canvasRatioPreset));
float canvasRatioHeight = configuredCanvasRatioDimension(scaleCells, 21, canvasRatioPresetHeight(canvasRatioPreset));
String[] levelLabels = split(rowsOrEmpty(data, LEVEL_LABEL_ROW), ",");
String[] levelElevations = split(rowsOrEmpty(data, LEVEL_ELEVATION_ROW), ",");
boolean hasExplicitStartLevel = scaleRowHasExplicitStartLevel(scaleCells);
String startLevelLabel = safeCell(scaleCells, 10);
float startLevelElevationM = configuredFloat(scaleCells, 11, 0.0);
if (!hasExplicitStartLevel) {
  int inferredStartLevelIndex = findLegacyStartLevelIndex(levelLabels, levelElevations);
  if (inferredStartLevelIndex >= 0) {
    startLevelLabel = safeCell(levelLabels, inferredStartLevelIndex);
    startLevelElevationM = parseFloat(safeCell(levelElevations, inferredStartLevelIndex));
  }
}
if (startLevelLabel.length() == 0) {
  startLevelLabel = "GF";
}

float gridW_px = gridWidthM * pxPerMeterH;
float gridH_px = gridHeightM * pxPerMeterV;

// Failsafe just in case CSV is missing data
if (gridW_px <= 0) gridW_px = 50;
if (gridH_px <= 0) gridH_px = 50;

float diagramWidth = 0;
float routeCursorPreviewY = 0;
float routeMinY = 0;
float routeMaxY = 0;
for (int i = SEGMENT_START_ROW; i <= SEGMENT_END_ROW; i++) {
  float[] rowData = float(split(data[i], ","));
  if (rowData.length > 1 && rowData[1] == 0) break; // Break when segment length is 0
  if (rowData.length > 1) {
    diagramWidth += rowData[1];
    routeMinY = min(routeMinY, routeCursorPreviewY);
    routeMaxY = max(routeMaxY, routeCursorPreviewY);
    routeCursorPreviewY -= rowData[2];
    routeMinY = min(routeMinY, routeCursorPreviewY);
    routeMaxY = max(routeMaxY, routeCursorPreviewY);
  }
}

for (int i = 0; i < min(levelLabels.length, levelElevations.length); i++) {
  String levelLabel = trim(levelLabels[i]);
  String elevationRaw = trim(levelElevations[i]);
  if (levelLabel.length() == 0 || elevationRaw.length() == 0) {
    continue;
  }
  float levelElevation = parseFloat(elevationRaw);
  if (Float.isNaN(levelElevation)) {
    continue;
  }
  float levelY = -(levelElevation - startLevelElevationM) * pxPerMeterV;
  routeMinY = min(routeMinY, levelY);
  routeMaxY = max(routeMaxY, levelY);
}

float drawingTopY = routeMinY - corrH - acH - 50;
float drawingBottomY = routeMaxY + 95;
float leftReserve = max(canvasPaddingX, 100);
float rightReserve = max(canvasPaddingX, 260);
int cW = round(max(diagramWidth + leftReserve + rightReserve + 20, 1000));
float bottomPadding = max(canvasPaddingBottom, showLegend ? 160 : 90);
int cH = round(max(canvasPaddingTop + (drawingBottomY - drawingTopY) + bottomPadding + 20, 420));
if (!canvasRatioPreset.equals("auto")) {
  float[] adjustedCanvasSize = adjustedCanvasSizeForRatio(cW, cH, canvasRatioWidth, canvasRatioHeight, gridW_px, gridH_px);
  cW = round(adjustedCanvasSize[0]);
  cH = round(adjustedCanvasSize[1]);
}
float startXMin = leftReserve;
float startXMax = max(startXMin, cW - 20 - rightReserve - diagramWidth);
float startX = snappedValueInRange((cW - 20 - diagramWidth) / 2.0, startXMin, startXMax, gridW_px);

PGraphics pg = createGraphics(cW * SCALE, cH * SCALE, JAVA2D);
pg.beginDraw();
pg.scale(SCALE);
pg.smooth();
pg.background(255);
pg.translate(10, 10);
pg.imageMode(CENTER); pg.textAlign(CENTER, CENTER); pg.strokeCap(SQUARE);

// Dynamic layout anchors
float legendY = cH - 110;
float drawingHeight = drawingBottomY - drawingTopY;
float routeAreaTop = 20;
float routeAreaBottom = max(routeAreaTop + drawingHeight, legendY - 20);
float diagramYMin = routeAreaTop - drawingTopY;
float diagramYMax = max(diagramYMin, routeAreaBottom - drawingBottomY);
float diagramY = snappedValueInRange(routeAreaTop + ((routeAreaBottom - routeAreaTop) - drawingHeight) / 2.0 - drawingTopY, diagramYMin, diagramYMax, gridH_px);

// Draw grids using the configured real-world grid dimensions
pg.stroke(220);
for (float i = 0; i <= cW; i += gridW_px) {
  pg.line(i, 0, i, cH);
}
for (float i = 0; i <= cH; i += gridH_px) {
  pg.line(0, i, cW, i);
}
pg.stroke(0); pg.noFill(); pg.rect(0, 0, cW-20, cH-20);//draw frame

// Scale bar pinned to the right and bottom, mathematically snapped to ONE actual grid square
float scaleBoxX = floor((cW - gridW_px - 40) / gridW_px) * gridW_px; 
float scaleBoxY = floor(legendY / gridH_px) * gridH_px;

pg.stroke(150); pg.strokeWeight(1.5); pg.noFill(); 
pg.rect(scaleBoxX, scaleBoxY, gridW_px, gridH_px);//draw scale bar matching exactly one grid square

pg.textFont(f10, 10); pg.fill(150); 
pg.textAlign(CENTER, TOP);
pg.text(formatGridMeasure(gridWidthM) + "m", scaleBoxX + gridW_px/2, scaleBoxY + gridH_px + 8); // Centered below box
pg.textAlign(LEFT, CENTER);
pg.text(formatGridMeasure(gridHeightM) + "m", scaleBoxX + gridW_px + 8, scaleBoxY + gridH_px/2); // Centered to the right of box

pg.textAlign(CENTER, CENTER); // Reset for the rest of the script elements
los = normalizeLosCode(configuredFloat(scaleCells, 6, 0));//los = overall level of service

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//draw legend///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
if (showLegend) {
  pg.stroke(220); pg.strokeWeight(1); pg.fill(255); pg.rect(100, legendY, 600, 50);
  pg.stroke(0); pg.strokeWeight(0.5); pg.line(100, legendY, 700, legendY); pg.line(100, legendY+50, 700, legendY+50);
  pg.noStroke();
  pg.fill(50,255,0,200);   pg.rect(130,legendY+15,40,20); pg.fill(0); pg.text("A",150,legendY+25);//LOS=A
  pg.fill(150,255,120,200);pg.rect(170,legendY+15,40,20); pg.fill(0); pg.text("B",190,legendY+25);//LOS=B
  pg.fill(200,255,180,200);pg.rect(210,legendY+15,40,20); pg.fill(0); pg.text("C",230,legendY+25);//LOS=C
  pg.fill(250,234,160,200);pg.rect(250,legendY+15,40,20); pg.fill(0); pg.text("D",270,legendY+25);//LOS=D
  pg.fill(230,210,130,200);pg.rect(290,legendY+15,40,20); pg.fill(0); pg.text("E",310,legendY+25);//LOS=E
  pg.fill(200,180,96,200); pg.rect(330,legendY+15,40,20); pg.fill(0); pg.text("F",350,legendY+25);//LOS=F
  for (int i = 420; i <= 480; i=i+3) {//Draw sheltered legend
    pg.noStroke(); pg.fill(0); pg.rectMode(CENTER); pg.rect(i,legendY+15,1,4);
  }
  pg.textAlign(LEFT, CENTER); pg.text("Sheltered",490,legendY+15);//Draw sheltered legend
  pg.noStroke(); pg.fill(93,255,255,70); pg.rect(450,legendY+35,62,acH*.75);//draw A/C legend
  for (int i = 420; i <= 480; i=i+3) {
    pg.noStroke(); pg.fill(0); pg.rectMode(CENTER); pg.rect(i,legendY+40,1,4);
  }
  pg.text("Air-conditioned",490,legendY+36);//Draw A/C legend
  img = getIcon("Picto Bottleneck.png");//Draw Bottleneck legend
  pg.image(img, 600, legendY+12.5);
  pg.text("Bottleneck",620,legendY+15);
  img = getIcon("Picto Turnstiles.png");//Draw Turnstiles legend
  pg.image(img, 600, legendY+30);
  pg.text("Turnstiles",620,legendY+36);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//draw floor levels/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
pg.textAlign(CENTER, CENTER);

// Translate to our dynamically centered and grid-snapped coordinates
float routeCursorX = 0;
float routeCursorY = 0;
pg.pushMatrix();
pg.translate(startX, diagramY); 

num2 = levelLabels; //31=Level
num3 = float(levelElevations); //32=Elevation
pg.stroke(0); pg.strokeWeight(1); pg.line(-70,0,-50,0);//draw start elevation level
pg.textFont(f10, 10); pg.fill(0); pg.text(startLevelLabel,-80,0);//draw start elevation text
int levelCount = min(num2.length, num3.length);
for (int i = 0; i < levelCount; i++) {
  String levelLabel = trim(num2[i]);
  if (levelLabel.length() > 0 && !Float.isNaN(num3[i])) {
    if (levelLabel.equals(startLevelLabel) && abs(num3[i] - startLevelElevationM) <= 0.01) {
      continue;
    }
    float relativeElevationM = num3[i] - startLevelElevationM;
    pg.stroke(0); pg.strokeWeight(1); pg.line(-70,-relativeElevationM*pxPerMeterV,-50,-relativeElevationM*pxPerMeterV);//draw elevation level
    pg.textFont(f10, 10); pg.fill(0); pg.text(levelLabel,-80,-relativeElevationM*pxPerMeterV);//draw elevation text
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//start the while loop//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
int loop = 1;
while (loop <= SEGMENT_END_ROW) {
  num = float(split(data[loop], ",")); //loop=segment number  
  if (num[1]==0) { 
    break;
  }  
  pg.noStroke();
  applyLosFill(pg, normalizeLosCode(num[6]), 150);
  pg.quad(0,0,0,-corrH,num[1],-num[2]-corrH,num[1],-num[2]);//draw LOS polygon
  pg.stroke(0); pg.strokeWeight(2.5); pg.line(0,0,num[1],-num[2]);//draw segment line
  pg.stroke(0); pg.fill(0); pg.circle(0,0,4);//draw starting point

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //draw shelter////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  if (int(num[3])==2) { //draw shelter;2=sheltered
    for (int i = 0; i <= num[1]; i=i+3) {
      pg.noStroke(); pg.fill(0); pg.rectMode(CENTER); pg.rect(i,(-num[2]/num[1]*i)-corrH,1,4);
    }
  }
  if (int(num[3])==3) { //draw air-con;3=air-conditioned
    pg.noStroke(); pg.fill(93,255,255,70); pg.quad(0,-corrH,0,-corrH-acH,num[1],-num[2]-corrH-acH,num[1],-num[2]-corrH);//draw A/C
    for (int i = 0; i <= num[1]; i=i+3) {
      pg.noStroke(); pg.fill(0); pg.rectMode(CENTER); pg.rect(i,(-num[2]/num[1]*i)-corrH,1,4);
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //draw start picto////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  drawStartPictogram(pg, int(num[4]), num[2]);

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //draw mid picto//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  drawMidPictogram(pg, int(num[5]), num[1], num[2]);

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //End the loop////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  routeCursorX += num[1];
  routeCursorY -= num[2];
  pg.translate(num[1], -num[2]);//shift origin
  loop = loop + 1;
} 

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//draw destination picto////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
pg.stroke(0); pg.fill(0); pg.circle(0,0,4);//draw ending point
float destinationRightClearance = 0;
if (loop <= SEGMENT_END_ROW) {
  num = float(split(data[loop], ",")); //loop=segment number 
  destinationRightClearance = drawDestinationPictogram(pg, int(num[4]));
}
pg.popMatrix();

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//measure travel distance///////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
num = float(split(data[TOTAL_ROW], ",")); //30=total number
float routeEndCanvasX = startX + routeCursorX;
float routeEndCanvasY = diagramY + routeCursorY;
drawDestinationMetricSummary(
  pg,
  routeEndCanvasX,
  routeEndCanvasY,
  destinationMetricLabelPosition,
  destinationRightClearance,
  "H: " + str(int(num[1])) + "m",
  "V: " + str(int(num[2])) + "m",
  cW,
  cH,
  legendY,
  scaleBoxY
);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//measure overall los///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
float badgeInset = 20;
float badgeX = cW - 20 - badgeInset - corrH/2;
float badgeY = badgeInset + corrH/2;
pg.textAlign(CENTER, CENTER);
if (showOverallLos) {
  drawLosBadge(pg, los, badgeX, badgeY);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//save as png (lossless, high-res)//////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
pg.endDraw();
pg.save(previewOutputPath());
exit();
}

ArrayList<String> validateData(String[] rows) {
  ArrayList<String> errors = new ArrayList<String>();

  if (rows == null || rows.length == 0) {
    errors.add("JLOS_data.csv could not be loaded.");
    return errors;
  }

  if (rows.length <= LEVEL_ELEVATION_ROW) {
    errors.add("CSV is incomplete. Expected rows 0 to 32 for scale, segments, totals, and floor levels.");
    return errors;
  }

  validateScaleRow(rows[0], errors);

  boolean foundActiveSegment = false;
  for (int row = SEGMENT_START_ROW; row <= SEGMENT_END_ROW; row++) {
    String[] cells = split(rows[row], ",");
    if (cells.length < 7) {
      errors.add("Row " + row + " must include at least 7 columns.");
      continue;
    }

    float length = requireFloat(cells, 1, row, "horizontal distance", errors);
    requireFloat(cells, 2, row, "vertical distance", errors);
    requireFloat(cells, 3, row, "weather protection code", errors);
    requireFloat(cells, 4, row, "start or destination pictogram code", errors);
    requireFloat(cells, 5, row, "mid pictogram code", errors);
    float rowLos = requireFloat(cells, 6, row, "segment LOS", errors);

    if (length > 0) {
      foundActiveSegment = true;
      if (normalizeLosCode(rowLos) == 0) {
        errors.add("Row " + row + " has unsupported LOS code '" + safeCell(cells, 6) + "'. Use 1-6 or 50-55.");
      }
    }
  }

  if (!foundActiveSegment) {
    errors.add("No active segments were found in rows 1 to 29.");
  }

  String[] totalCells = split(rows[TOTAL_ROW], ",");
  requireFloat(totalCells, 1, TOTAL_ROW, "total horizontal distance", errors);
  requireFloat(totalCells, 2, TOTAL_ROW, "total vertical distance", errors);

  String[] labels = split(rows[LEVEL_LABEL_ROW], ",");
  String[] elevations = split(rows[LEVEL_ELEVATION_ROW], ",");
  int pairedLevels = min(labels.length, elevations.length);
  for (int i = 0; i < pairedLevels; i++) {
    String label = trim(labels[i]);
    String elevation = trim(elevations[i]);
    if (label.length() == 0 && elevation.length() == 0) {
      continue;
    }
    if (label.length() == 0) {
      if (elevation.length() == 0) {
        continue;
      }
      float placeholderValue = parseFloat(elevation);
      if (!Float.isNaN(placeholderValue) && placeholderValue == 0) {
        continue;
      }
      errors.add("Floor level row mismatch at column " + (i + 1) + ".");
      continue;
    }
    if (elevation.length() == 0) {
      errors.add("Floor level row mismatch at column " + (i + 1) + ".");
      continue;
    }
    if (Float.isNaN(parseFloat(elevation))) {
      errors.add("Floor elevation '" + elevation + "' in row " + LEVEL_ELEVATION_ROW + " is not numeric.");
      continue;
    }
  }

  return errors;
}

void validateScaleRow(String row, ArrayList<String> errors) {
  String[] cells = split(row, ",");
  if (cells.length < 7) {
    errors.add("Row 0 must include scale values and overall LOS.");
    return;
  }

  float horizontalScale = requireFloat(cells, 1, 0, "horizontal scale", errors);
  float verticalScale = requireFloat(cells, 2, 0, "vertical scale", errors);
  float overallLos = requireFloat(cells, 6, 0, "overall LOS", errors);
  requireOptionalPositiveFloat(cells, 3, 0, "Grid width", errors);
  requireOptionalPositiveFloat(cells, 4, 0, "Grid height", errors);
  if (safeCell(cells, 14).equalsIgnoreCase(CANVAS_PADDING_MARKER)) {
    requireOptionalPositiveFloat(cells, 15, 0, "Canvas padding X", errors);
    requireOptionalPositiveFloat(cells, 16, 0, "Canvas padding top", errors);
    requireOptionalPositiveFloat(cells, 17, 0, "Canvas padding bottom", errors);
  }
  validateCanvasRatioRow(cells, errors);

  if (!Float.isNaN(horizontalScale) && horizontalScale <= 0) {
    errors.add("Horizontal scale in row 0 must be greater than 0.");
  }
  if (!Float.isNaN(verticalScale) && verticalScale <= 0) {
    errors.add("Vertical scale in row 0 must be greater than 0.");
  }
  if (!Float.isNaN(overallLos) && normalizeLosCode(overallLos) == 0) {
    errors.add("Overall LOS in row 0 must use 1-6 or 50-55.");
  }

  if (scaleRowHasExplicitStartLevel(cells)) {
    String startLabel = safeCell(cells, 10);
    String startElevation = safeCell(cells, 11);
    if (startLabel.length() == 0) {
      errors.add("Row 0 start level label is required when the start-level columns are used.");
    }
    if (startElevation.length() == 0) {
      errors.add("Row 0 start level elevation is required when the start-level columns are used.");
    } else if (Float.isNaN(parseFloat(startElevation))) {
      errors.add("Row 0 start level elevation must be numeric.");
    }
  }
}

float requireFloat(String[] cells, int index, int rowNumber, String fieldName, ArrayList<String> errors) {
  String rawValue = safeCell(cells, index);
  if (rawValue.length() == 0) {
    errors.add("Row " + rowNumber + " is missing " + fieldName + " at column " + (index + 1) + ".");
    return Float.NaN;
  }

  float value = parseFloat(rawValue);
  if (Float.isNaN(value)) {
    errors.add("Row " + rowNumber + " has non-numeric " + fieldName + " value '" + rawValue + "'.");
  }
  return value;
}

void requireOptionalPositiveFloat(String[] cells, int index, int rowNumber, String fieldName, ArrayList<String> errors) {
  String rawValue = safeCell(cells, index);
  if (rawValue.length() == 0) {
    return;
  }

  float value = parseFloat(rawValue);
  if (Float.isNaN(value)) {
    errors.add("Row " + rowNumber + " has non-numeric " + fieldName.toLowerCase() + " value '" + rawValue + "'.");
    return;
  }
  if (value <= 0) {
    errors.add(fieldName + " in row " + rowNumber + " must be greater than 0.");
  }
}

float requirePositiveFloat(String[] cells, int index, int rowNumber, String fieldName, ArrayList<String> errors) {
  float value = requireFloat(cells, index, rowNumber, fieldName, errors);
  if (!Float.isNaN(value) && value <= 0) {
    errors.add(fieldName + " in row " + rowNumber + " must be greater than 0.");
  }
  return value;
}

void validateCanvasRatioRow(String[] cells, ArrayList<String> errors) {
  if (!safeCell(cells, 18).equalsIgnoreCase(CANVAS_RATIO_MARKER)) {
    return;
  }

  String preset = normalizeCanvasRatioPreset(safeCell(cells, 19));
  if (preset.length() == 0) {
    errors.add("Canvas ratio preset in row 0 must be auto, 16:9, 4:3, 3:2, 1:1, or custom.");
    return;
  }

  if (preset.equals("custom")) {
    requirePositiveFloat(cells, 20, 0, "Canvas ratio width", errors);
    requirePositiveFloat(cells, 21, 0, "Canvas ratio height", errors);
  } else {
    requireOptionalPositiveFloat(cells, 20, 0, "Canvas ratio width", errors);
    requireOptionalPositiveFloat(cells, 21, 0, "Canvas ratio height", errors);
  }
}

String safeCell(String[] cells, int index) {
  if (index < 0 || index >= cells.length) {
    return "";
  }
  return trim(cells[index]);
}

String rowsOrEmpty(String[] rows, int index) {
  if (rows == null || index < 0 || index >= rows.length) {
    return "";
  }
  return rows[index];
}

boolean scaleRowHasExplicitStartLevel(String[] cells) {
  return safeCell(cells, 9).equalsIgnoreCase("START LEVEL>>")
    || safeCell(cells, 10).length() > 0
    || safeCell(cells, 11).length() > 0;
}

float configuredCanvasPaddingValue(String[] cells, int valueIndex, float defaultValue) {
  if (!safeCell(cells, 14).equalsIgnoreCase(CANVAS_PADDING_MARKER)) {
    return defaultValue;
  }
  return configuredFloat(cells, valueIndex, defaultValue);
}

String configuredCanvasRatioPreset(String[] cells) {
  if (!safeCell(cells, 18).equalsIgnoreCase(CANVAS_RATIO_MARKER)) {
    return DEFAULT_CANVAS_RATIO_PRESET;
  }

  String preset = normalizeCanvasRatioPreset(safeCell(cells, 19));
  return preset.length() > 0 ? preset : DEFAULT_CANVAS_RATIO_PRESET;
}

float configuredCanvasRatioDimension(String[] cells, int valueIndex, float defaultValue) {
  if (!safeCell(cells, 18).equalsIgnoreCase(CANVAS_RATIO_MARKER)) {
    return defaultValue;
  }
  return configuredFloat(cells, valueIndex, defaultValue);
}

String normalizeCanvasRatioPreset(String rawValue) {
  String normalizedValue = trim(rawValue).toLowerCase();
  if (normalizedValue.equals("auto")
    || normalizedValue.equals("16:9")
    || normalizedValue.equals("4:3")
    || normalizedValue.equals("3:2")
    || normalizedValue.equals("1:1")
    || normalizedValue.equals("custom")) {
    return normalizedValue;
  }
  return "";
}

float canvasRatioPresetWidth(String preset) {
  if (preset.equals("4:3")) return 4;
  if (preset.equals("3:2")) return 3;
  if (preset.equals("1:1")) return 1;
  return DEFAULT_CANVAS_RATIO_WIDTH;
}

float canvasRatioPresetHeight(String preset) {
  if (preset.equals("4:3")) return 3;
  if (preset.equals("3:2")) return 2;
  if (preset.equals("1:1")) return 1;
  return DEFAULT_CANVAS_RATIO_HEIGHT;
}

String configuredMetricLabelPosition(String[] cells, String defaultValue) {
  String marker = safeCell(cells, 12);
  String rawValue = safeCell(cells, 13);
  if (!marker.equalsIgnoreCase("HV LABEL POS>>") && rawValue.length() == 0) {
    return defaultValue;
  }

  String normalizedValue = normalizeMetricLabelPosition(rawValue);
  return normalizedValue.length() > 0 ? normalizedValue : defaultValue;
}

String normalizeMetricLabelPosition(String rawValue) {
  String normalizedValue = trim(rawValue).toLowerCase();
  if (normalizedValue.equals("right") || normalizedValue.equals("above") || normalizedValue.equals("below")) {
    return normalizedValue;
  }
  return "";
}

int findLegacyStartLevelIndex(String[] labels, String[] elevations) {
  int pairedLevels = min(labels.length, elevations.length);
  for (int i = 0; i < pairedLevels; i++) {
    String label = trim(labels[i]);
    String elevation = trim(elevations[i]);
    if (label.length() == 0 || elevation.length() == 0) {
      continue;
    }
    float elevationValue = parseFloat(elevation);
    if (!Float.isNaN(elevationValue) && abs(elevationValue) <= 0.01) {
      return i;
    }
  }
  return -1;
}

void renderValidationError(ArrayList<String> errors) {
  PGraphics errorPg = createGraphics(1600, 900, JAVA2D);
  errorPg.beginDraw();
  errorPg.background(255);
  errorPg.fill(0);
  errorPg.textAlign(LEFT, TOP);
  errorPg.textFont(f30, 30);
  errorPg.text("JLOS CSV Validation Failed", 60, 60);
  errorPg.textFont(f10, 20);

  float y = 130;
  for (int i = 0; i < errors.size(); i++) {
    errorPg.text((i + 1) + ". " + errors.get(i), 60, y);
    y += 34;
  }

  y += 20;
  errorPg.text("Fix JLOS_data.csv or re-export it from JLOS_data.xlsx, then run JLOS.pde again.", 60, y);
  errorPg.endDraw();
  errorPg.save(previewOutputPath());

  println("JLOS CSV validation failed:");
  for (String error : errors) {
    println("- " + error);
  }
}

int normalizeLosCode(float rawValue) {
  int code = int(rawValue);
  if (code >= 50 && code <= 55) {
    return code - 49;
  }
  if (code >= 1 && code <= 6) {
    return code;
  }
  return 0;
}

void applyLosFill(PGraphics pg, int losCode, int alpha) {
  if      (losCode == 1) { pg.fill(50,255,0,alpha); }
  else if (losCode == 2) { pg.fill(150,255,120,alpha); }
  else if (losCode == 3) { pg.fill(200,255,180,alpha); }
  else if (losCode == 4) { pg.fill(250,234,160,alpha); }
  else if (losCode == 5) { pg.fill(230,210,130,alpha); }
  else if (losCode == 6) { pg.fill(200,180,96,alpha); }
  else                   { pg.fill(235,235,235,alpha); }
}

void drawLosBadge(PGraphics pg, int losCode, float x, float y) {
  if (losCode == 0) {
    return;
  }
  pg.stroke(0);
  pg.strokeWeight(1);
  applyLosFill(pg, losCode, 150);
  pg.rectMode(CENTER);
  pg.rect(x, y, corrH, corrH);
  pg.fill(0);
  pg.textFont(f30, 30);
  pg.text(losLetter(losCode), x+1, y);
}

String losLetter(int losCode) {
  if (losCode >= 1 && losCode <= 6) {
    return String.valueOf((char)('A' + losCode - 1));
  }
  return "?";
}

String previewOutputPath() {
  if (args != null && args.length > 0) {
    String candidate = trim(args[0]);
    if (candidate.length() > 0) {
      return candidate;
    }
  }
  return "sample_hires.png";
}

float configuredFloat(String[] cells, int index, float defaultValue) {
  String rawValue = safeCell(cells, index);
  if (rawValue.length() == 0) {
    return defaultValue;
  }

  float value = parseFloat(rawValue);
  if (Float.isNaN(value)) {
    return defaultValue;
  }
  return value;
}

boolean configuredFlag(String[] cells, int index, boolean defaultValue) {
  String rawValue = safeCell(cells, index);
  if (rawValue.length() == 0) {
    return defaultValue;
  }

  float value = parseFloat(rawValue);
  if (Float.isNaN(value)) {
    return defaultValue;
  }
  return value != 0;
}

String formatGridMeasure(float value) {
  String formatted = nf(value, 0, 3);
  while (formatted.endsWith("0")) {
    formatted = formatted.substring(0, formatted.length() - 1);
  }
  if (formatted.endsWith(".")) {
    formatted = formatted.substring(0, formatted.length() - 1);
  }
  return formatted;
}

void initPictogramMetadata() {
  if (pictogramIconFiles.size() > 0) {
    return;
  }

  pictogramIconFiles.put(1, "Picto Metro.png");
  pictogramIconFiles.put(2, "Picto Bus.png");
  pictogramIconFiles.put(3, "Picto BRT.png");
  pictogramIconFiles.put(4, "Picto Tour Coach.png");
  pictogramIconFiles.put(5, "Picto Rail.png");
  pictogramIconFiles.put(6, "Picto Air Taxi.png");
  pictogramIconFiles.put(7, "Picto Minibus.png");
  pictogramIconFiles.put(8, "Picto Ferry.png");
  pictogramIconFiles.put(9, "Picto Taxi.png");
  pictogramIconFiles.put(10, "Picto uber.png");
  pictogramIconFiles.put(11, "Picto Bike.png");
  pictogramIconFiles.put(12, "Picto Private Car.png");
  pictogramIconFiles.put(13, "Picto Smart Car.png");
  pictogramIconFiles.put(14, "Picto Escalator Up.png");
  pictogramIconFiles.put(15, "Picto Escalator Down.png");
  pictogramIconFiles.put(16, "Picto Stair Up.png");
  pictogramIconFiles.put(17, "Picto Stair Down.png");
  pictogramIconFiles.put(18, "Picto Bottleneck.png");
  pictogramIconFiles.put(19, "Picto Turnstiles.png");
  pictogramIconFiles.put(20, "Picto WC.png");
  pictogramIconFiles.put(21, "Picto Retail.png");
  pictogramIconFiles.put(22, "Picto Ticketing.png");
  pictogramIconFiles.put(23, "Picto F&B.png");

  pictogramLabels.put(1, "METRO");
  pictogramLabels.put(2, "BUS");
  pictogramLabels.put(3, "BRT");
  pictogramLabels.put(4, "COACH");
  pictogramLabels.put(5, "RAIL");
  pictogramLabels.put(6, "EVTOL");
  pictogramLabels.put(7, "MINIBUS");
  pictogramLabels.put(8, "FERRY");
  pictogramLabels.put(9, "TAXI");
  pictogramLabels.put(10, "UBER");
  pictogramLabels.put(11, "BIKE");
  pictogramLabels.put(12, "DROP-OFF");
  pictogramLabels.put(13, "SMART CAR");
  pictogramLabels.put(20, "WASHROOM");
  pictogramLabels.put(21, "RETAIL");
  pictogramLabels.put(22, "TICKETING");
  pictogramLabels.put(23, "F&B");
}

String pictogramIconFile(int code) {
  initPictogramMetadata();
  if (!pictogramIconFiles.containsKey(code)) {
    return "";
  }
  return pictogramIconFiles.get(code);
}

String pictogramLabel(int code) {
  initPictogramMetadata();
  if (!pictogramLabels.containsKey(code)) {
    return "";
  }
  return pictogramLabels.get(code);
}

boolean isTerminalPictogram(int code) {
  return code >= 1 && code <= 13;
}

float terminalLabelX(int code) {
  if (code == 12 || code == 13) {
    return 21;
  }
  return -21;
}

void drawTerminalPictogram(PGraphics pg, int code, float iconX, float iconY, float labelX, float labelY) {
  String iconFile = pictogramIconFile(code);
  if (iconFile.length() == 0) {
    return;
  }

  PImage icon = getIcon(iconFile);
  pg.image(icon, iconX, iconY);
  String label = pictogramLabel(code);
  if (label.length() > 0) {
    pg.textFont(f10, 10);
    pg.fill(0);
    pg.text(label, labelX, labelY);
  }
}

void drawCalloutPictogram(PGraphics pg, int code, float x, float y) {
  String iconFile = pictogramIconFile(code);
  if (iconFile.length() == 0) {
    return;
  }

  PImage icon = getIcon(iconFile);
  pg.image(icon, x, y);
  String label = pictogramLabel(code);
  if (label.length() > 0) {
    pg.stroke(0);
    pg.strokeWeight(1);
    pg.line(x, -3, x, lg);
    pg.text(label, x, lg+7);
  }
}

void drawStartPictogram(PGraphics pg, int code, float segmentVerticalPx) {
  if (isTerminalPictogram(code)) {
    drawTerminalPictogram(pg, code, -21, -15, terminalLabelX(code), 10);
    return;
  }
  if (code == 18 || code == 19 || code == 20 || code == 21 || code == 22 || code == 23) {
    drawCalloutPictogram(pg, code, 0, -segmentVerticalPx/2-corrH/2);
  }
}

void drawMidPictogram(PGraphics pg, int code, float segmentHorizontalPx, float segmentVerticalPx) {
  if (code == 0) {
    return;
  }
  float iconX = segmentHorizontalPx/2;
  float iconY = -segmentVerticalPx/2-corrH/2;
  if (code >= 14 && code <= 19) {
    String iconFile = pictogramIconFile(code);
    if (iconFile.length() > 0) {
      pg.image(getIcon(iconFile), iconX, iconY);
    }
    return;
  }
  drawCalloutPictogram(pg, code, iconX, iconY);
}

float drawDestinationPictogram(PGraphics pg, int destinationCode) {
  String iconFile = pictogramIconFile(destinationCode);
  if (iconFile.length() == 0) {
    return 0;
  }

  String label = pictogramLabel(destinationCode);
  PImage destinationIcon = getIcon(iconFile);
  pg.image(destinationIcon, 21, -15);

  pg.textFont(f10, 10);
  pg.fill(0);
  if (label.length() > 0) {
    pg.text(label, 21, 10);
  }

  float iconRightEdge = 21 + destinationIcon.width / 2.0;
  float labelRightEdge = label.length() > 0 ? 21 + pg.textWidth(label) / 2.0 : 0;
  return max(iconRightEdge, labelRightEdge);
}

void drawDestinationMetricSummary(
  PGraphics pg,
  float routeEndCanvasX,
  float routeEndCanvasY,
  String labelPosition,
  float destinationRightClearance,
  String horizontalText,
  String verticalText,
  float canvasWidth,
  float canvasHeight,
  float legendY,
  float scaleBoxY
) {
  pg.textFont(f10, 10);
  pg.fill(0);

  float lineHeight = pg.textAscent() + pg.textDescent();
  float blockWidth = max(pg.textWidth(horizontalText), pg.textWidth(verticalText));
  float blockHeight = DESTINATION_SUMMARY_LINE_SPACING + lineHeight;
  float safeLeft = DESTINATION_SUMMARY_FRAME_PADDING;
  float safeTop = DESTINATION_SUMMARY_FRAME_PADDING;
  float safeRight = canvasWidth - 20 - DESTINATION_SUMMARY_FRAME_PADDING;
  float safeBottom = min(canvasHeight - 20 - DESTINATION_SUMMARY_FRAME_PADDING, min(legendY, scaleBoxY) - DESTINATION_SUMMARY_FRAME_PADDING);
  float maxLeft = max(safeLeft, safeRight - blockWidth);
  float maxTop = max(safeTop, safeBottom - blockHeight);
  float textCenterOffsetY = lineHeight / 2.0;

  String normalizedPosition = normalizeMetricLabelPosition(labelPosition);
  if (normalizedPosition.length() == 0) {
    normalizedPosition = DEFAULT_DESTINATION_METRIC_LABEL_POSITION;
  }

  float blockLeft;
  float blockTop;
  if (normalizedPosition.equals("right")) {
    float rightOffset = destinationRightClearance > 0
      ? destinationRightClearance + DESTINATION_SUMMARY_ICON_GAP
      : DESTINATION_SUMMARY_DEFAULT_RIGHT_GAP;
    blockLeft = routeEndCanvasX + rightOffset;
    blockTop = routeEndCanvasY - blockHeight / 2.0;
    blockLeft = constrain(blockLeft, safeLeft, maxLeft);
    blockTop = constrain(blockTop, safeTop, maxTop);
    pg.textAlign(LEFT, CENTER);
    pg.text(horizontalText, blockLeft, blockTop + textCenterOffsetY);
    pg.text(verticalText, blockLeft, blockTop + textCenterOffsetY + DESTINATION_SUMMARY_LINE_SPACING);
    return;
  }

  blockLeft = routeEndCanvasX - blockWidth / 2.0;
  if (normalizedPosition.equals("above")) {
    blockTop = routeEndCanvasY - DESTINATION_SUMMARY_POINT_GAP - blockHeight;
  } else {
    blockTop = routeEndCanvasY + DESTINATION_SUMMARY_POINT_GAP;
  }

  blockLeft = constrain(blockLeft, safeLeft, maxLeft);
  blockTop = constrain(blockTop, safeTop, maxTop);

  float blockCenterX = blockLeft + blockWidth / 2.0;
  pg.textAlign(CENTER, CENTER);
  pg.text(horizontalText, blockCenterX, blockTop + textCenterOffsetY);
  pg.text(verticalText, blockCenterX, blockTop + textCenterOffsetY + DESTINATION_SUMMARY_LINE_SPACING);
}

PImage getIcon(String fileName) {
  if (!iconCache.containsKey(fileName)) {
    iconCache.put(fileName, loadImage(fileName));
  }
  return iconCache.get(fileName);
}

float snappedValueInRange(float value, float minValue, float maxValue, float gridSize) {
  if (maxValue < minValue) {
    return minValue;
  }
  if (gridSize <= 0) {
    return constrain(value, minValue, maxValue);
  }

  float minSnapped = ceil(minValue / gridSize) * gridSize;
  float maxSnapped = floor(maxValue / gridSize) * gridSize;
  if (maxSnapped < minSnapped) {
    return constrain(value, minValue, maxValue);
  }

  float snapped = round(value / gridSize) * gridSize;
  return constrain(snapped, minSnapped, maxSnapped);
}

float[] adjustedCanvasSizeForRatio(float currentWidth, float currentHeight, float ratioWidth, float ratioHeight, float gridWidth, float gridHeight) {
  if (currentWidth <= 0 || currentHeight <= 0 || ratioWidth <= 0 || ratioHeight <= 0) {
    return new float[] { currentWidth, currentHeight };
  }

  float targetRatio = ratioWidth / ratioHeight;
  float currentRatio = currentWidth / currentHeight;
  if (abs(currentRatio - targetRatio) <= 0.001) {
    return new float[] { currentWidth, currentHeight };
  }

  if (currentRatio < targetRatio) {
    float desiredWidth = currentHeight * targetRatio;
    return new float[] { expandedCanvasSize(currentWidth, desiredWidth, gridWidth), currentHeight };
  }

  float desiredHeight = currentWidth / targetRatio;
  return new float[] { currentWidth, expandedCanvasSize(currentHeight, desiredHeight, gridHeight) };
}

float expandedCanvasSize(float currentSize, float desiredSize, float gridSize) {
  float neededExtra = max(0, desiredSize - currentSize);
  if (neededExtra <= 0) {
    return currentSize;
  }
  if (gridSize <= 0) {
    return ceil(desiredSize);
  }
  return currentSize + ceil(neededExtra / gridSize) * gridSize;
}
