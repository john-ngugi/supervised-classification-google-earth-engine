

//NDBI = (Band 6 - Band 5) / (Band 6 + Band 5)
//MSAVI = (2 * Band 5 + 1 – sqrt ((2 * Band 5 + 1)2 – 8 * (Band 5 – Band 4))) / 2.
//NDWI = (Band 5 – Band 6) / (Band 5 + Band 6)


function maskL8sr(image) {
  // Bits 3 and 5 are cloud shadow and cloud, respectively.
  var cloudShadowBitMask = 1 << 3;
  var cloudsBitMask = 1 << 5;
  // Get the pixel QA band.
  var qa = image.select('QA_PIXEL');
  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
      .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
  // Return the masked image, scaled to reflectance, without the QA bands.
  return image.updateMask(mask).divide(10000)
      .select("B[0-9]*")
      .copyProperties(image, ["system:time_start"]);
}

// import image collection 
var imageCollection = ee.ImageCollection("LANDSAT/LC08/C02/T1")
.filterDate('2017-01-01', '2017-12-31').map(maskL8sr);


// create the region of interest
var ROI = table;
function maskS2clouds(image){
    return image.updateMask(image.select('QA60').eq(0));

}


// get the median image 
var image = imageCollection
.median()
.clip(ROI);

var classification_image = imageCollection.median().clip(kishushe_old);

print(image);

// define the visualization parameters 
var s2Vis={
  bands: ['B4', 'B3', 'B2'],
  min: 0.143, 
  max: 1.53,
  gamma: 0.39,
};

// calculate NDVI 

var new_ndvi = classification_image.normalizedDifference(['B4','B5']);
var new_ndwi = classification_image.normalizedDifference(['B5','B6']);
var new_ndbi = classification_image.normalizedDifference(['B6','B5']);

var new_msavi = classification_image.expression('(2 * NIR + 1 - sqrt(pow((2 * NIR + 1), 2) - 8 * (NIR - RED)) ) / 2',
{
  'NIR':classification_image.select(['B5']),
  'RED': classification_image.select(['B4']),
});

print('ndvi',new_ndvi);
print('ndwi',new_ndwi);
print('ndbi',new_ndbi);
print('msavi',new_msavi);

var indexVis = {
  min:-1,
  max:1,
  palette:['red','yellow','green']
};

var waterindexVis = {
  min:-1,
  max:1,
  palette:['red','yellow','blue','blue']
};

Map.addLayer(new_ndvi,indexVis,'ndvi');
Map.addLayer(new_ndwi,waterindexVis,'ndwi');
Map.addLayer(new_ndbi,indexVis,'ndbi');
Map.addLayer(new_msavi,indexVis,'msavi');

var newBands = ee.Image([new_ndwi, new_ndvi,new_ndbi,new_msavi]);

classification_image = classification_image.addBands(newBands);

print('image with added_bands',classification_image);
var training = shrubland.merge(forest).merge(bareland).merge(developed).merge(water);
print('Training Data:', training);
print(training);
var label = 'class';
var bands=['B2','B3','B4','B5','B6','B10','nd','nd_1','nd_2','constant'];
var input = classification_image.select(bands);
// Convert string labels to numeric labels
var numericLabels = ee.List(training.aggregate_array('class')).distinct();

var trainingImage = input.sampleRegions({
  collection: training.map(function(feature){
    var numericLabel = ee.Number(numericLabels.indexOf(feature.get('class'))).add(1);
    return feature.set('class', numericLabel);
  }),
  properties: [label],
  scale: 30,
});

var trainingData = trainingImage.randomColumn();
var trainingSet = trainingData.filter(ee.Filter.lessThan('random', 0.8));
var testSet = trainingData.filter(ee.Filter.greaterThanOrEquals('random', 0.8));



   
//classification 

var classifier= ee.Classifier.smileRandomForest(10).train(trainingSet,label,bands);

var ndvi = image.normalizedDifference(['B4','B5']);
var ndwi = image.normalizedDifference(['B5','B6']);
var ndbi = image.normalizedDifference(['B6','B5']);

var msavi = image.expression('(2 * NIR + 1 - sqrt(pow((2 * NIR + 1), 2) - 8 * (NIR - RED)) ) / 2',
{
  'NIR':image.select(['B5']),
  'RED': image.select(['B4']),
});

var newBands_classification = ee.Image([ndwi,ndvi,ndbi,msavi]);
image = image.addBands(newBands);
var new_input = image.select(bands);
var classified = new_input.classify(classifier);

// var anotherClassified = imagecollection.filterBounds(ROI1).median().classify(classifier)
var landCoverPalette=[
  '#0349d6', // water
  '#ce7e11',  // shrub, grass
  '#0eff5c', // forest
  '#ff0202', // urban
    '111149', // wetlands
    // '#ffd111', // croplands
  // '#bdc234', // barren

];
Map.addLayer(image,s2Vis,'image');
Map.addLayer(classified,{palette:landCoverPalette,min:0,max:5},'classified image');
// Map.addLayer(anotherClassified,{palette:landCoverPalette,min:0,max:3},'another classified image');
var confusionMatrix = ee.ConfusionMatrix(testSet.classify(classifier).errorMatrix({
  actual:'class',
  predicted:'classification',
}));


print('Confusion Matrix', confusionMatrix);
print('Classification accuracy', confusionMatrix.accuracy().multiply(100));
print('Kappa', confusionMatrix.kappa());

Export.image.toDrive({
  image:classified,
  description:'classification_image_for_2017_kishushe_new',
  folder:'Kishushe_LULC',
  region: ROI,
  scale:10,
  crs:'EPSG:4326',
  maxPixels:1e13,
  fileFormat: 'GeoTIFF',     
});


var shrublandIMG = classified.eq(1);
var forestIMG = classified.eq(2);
var barelandIMG = classified.eq(3);
var builtupIMG = classified.eq(4);
var waterIMG = classified.eq(5);
var croplandIMG = classified.eq(6);



// Map.addLayer(waterIMG,{},'water',false);
Map.addLayer(shrublandIMG,{},'shrubland',false);
Map.addLayer(forestIMG,{},'forest',false);
Map.addLayer(builtupIMG,{},'builtup',false);
Map.addLayer(barelandIMG,{},'bareland',false);
Map.addLayer(waterIMG,{},'water',false);
Map.addLayer(croplandIMG,{},'cropland',false);
// Map.addLayer(market_centers,{color:'black'},'markets');
// Map.addLayer(mining_spots,{color:'red'},'mining_spots');

print(shrublandIMG);
print(classified);


var areaImage = shrublandIMG.multiply(ee.Image.pixelArea());
var area = areaImage.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry:ROI,
  scale: 30,
  maxPixels: 1e10
  });
  
print(area) ; 
  
var urbanAreaSqKm = ee.Number(
  area.get('classification')).divide(1e6).round();
print(urbanAreaSqKm);

var areaImage = ee.Image.pixelArea().addBands(
      classified);
 
var areas = areaImage.reduceRegion({
      reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'class',
    }),
    geometry: ROI,
    scale: 30,
    maxPixels: 1e10
    }); 
 
print(areas);

var classAreas = ee.List(areas.get('groups'));
 
var classAreaLists = classAreas.map(function(item) {
  var areaDict = ee.Dictionary(item);
  var classNumber = ee.Number(areaDict.get('class')).format();
  var area = ee.Number(
    areaDict.get('sum')).divide(1e6).round();
  return ee.List([classNumber, area]);
});
 
var result = ee.Dictionary(classAreaLists.flatten());
print(result);


