/**
 * recompute segment-visitor in/out events starting from now into the future
 * It does the followings:
 *   1) compute the current in/out status, and all future changes
 *   2) remove all existing future changes in DB (which are computed since last time)
 *   3) insert the current in/out status and future changes into DB.
 *
 * SegmentVisitorFlow collections should contain "all" in/out events for any pairs of
 * segment and visitor from past into future, given the received encounters so far. 
 * The SegmentVisitorFlow collections are updated whenever relevant encounters are received.
 *
 * @param {Segment} segment
 * @param {Visitor} visitor
 */
var recomputeSegmentVisitorStatus = function(segment, visitor) {
  var matcher = new SegmentVisitorMatcher(segment, visitor);
  var statusDelta = matcher.computeCurrentStatus();
  var selector = {
    segmentId: segment._id,
    visitorId: visitor._id
  };

  if (statusDelta.length === 0) return; // Not supposed to be 0 though. Just to be safe.

  // remove all existing future events
  SegmentVisitorFlows.remove(_.extend({}, selector, {deltaAt: {$gte: statusDelta[0].deltaAt}}));

  var lastFlow = SegmentVisitorFlows.findOne(selector, {sort: {deltaAt: -1}});
  var lastDelta = lastFlow === undefined? -1: lastFlow.delta;
  _.each(statusDelta, function(flow) {
    if (flow.delta !== lastDelta) {
      SegmentVisitorFlows.insert(_.extend({}, selector, {deltaAt: flow.deltaAt, delta: flow.delta}));
      lastDelta = flow.delta;
    }
  });

  // console.log('[SegmentVisitorFLow] Segment visitor list: ', segment._id, segment.getVisitorIdList(lodash.now()));
  // console.log('[SegmentVisitorFlow] Visitor segment list: ', visitor._id, visitor.getSegmentIdList(lodash.now()));
};

var recomputeVisitorStatus = function(visitor) {
  Segments.find().map(function(segment) {
    recomputeSegmentVisitorStatus(segment, visitor);
  });
}

var recomputeEncounterVisitorStatus = function(encounter) {
  var visitor = Visitors.findOne({_id: encounter.visitorId});
  Segments.find().map(function(segment) {
    var matcher = new SegmentVisitorMatcher(segment, visitor);
    var isRelevant = matcher.checkEncounterIsRelevant(encounter);
    // console.log("[SegmentVisitorFlow] isRelevant", encounter, segment, isRelevant);
    // TODO: remove the "true" below to only recompute relevant segment.
    if (true || isRelevant) {
      recomputeSegmentVisitorStatus(segment, visitor);
    } 
  });
}

var handleSegmentAdded = function(segment) {
  Visitors.find().map(function(visitor) {
    recomputeSegmentVisitorStatus(segment, visitor);
  });
};

var handleVisitorAdded = function(visitor) {
  recomputeVisitorStatus(visitor);
};

var handleEncounterAdded = function(encounter) {
  recomputeEncounterVisitorStatus(encounter);
};

var handleEncounterChanged = function(encounter, oldEncounter) {
  recomputeEncounterVisitorStatus(encounter);
};

/*
 *  Return the visitor Id list of a particular segment at a particular time
 *
 *  @param {Segment} segment
 *  @param {timestamp in ms} at Time at which you are checking
 *  @returni {Number[]} Array of visitor id
 */
SegmentVisitorFlows.getSegmentVisitorIdList = function(segment, at) {
  var outIds = {};
  var inIds = {};
  SegmentVisitorFlows.find({segmentId: segment._id, deltaAt: {$lt: at}}, {sort: {deltaAt: -1}}).forEach(function(flow) {
    if (outIds[flow.visitorId] !== undefined) return; // since we sort in desc order, if an out event appeared before, everything else is irrelevant
    if (flow.delta === 1) inIds[flow.visitorId] = true;
    else outIds[flow.visitorId] = true;
  });
  return Object.keys(inIds);
}

/*
 *  Return the segment Id list, in which a particular visitor belongs, at a particular time
 *
 *  @param {Visitor} visitor
 *  @param {timestamp in ms} at Time at which you are checking
 *  @return {Number[]} Array of segment id
 */
SegmentVisitorFlows.getVisitorSegmentIdList = function(visitor, at) {
  var outIds = {};
  var inIds = {};
  SegmentVisitorFlows.find({visitorId: visitor._id, deltaAt: {$lt: at}}, {sort: {deltaAt: -1}}).forEach(function(flow) {
    if (outIds[flow.segmentId] !== undefined) return; // since we sort in desc order, if an out event appeared before, everything else is irrelevant
    if (flow.delta === 1) inIds[flow.segmentId] = true;
    else outIds[flow.segmentId] = true;
  });
  return Object.keys(inIds);
}

SegmentVisitorFlow.ensureIndex = function () {
  SegmentVisitorFlows._ensureIndex({
    segmentId: 1,
    deltaAt: 1
  });
  SegmentVisitorFlows._ensureIndex({
    visitorId: 1,
    deltaAt: 1
  });
};

SegmentVisitorFlow.startup = function () {
  Visitors.find().observe({
    _suppress_initial: true,
    "added": handleVisitorAdded
  });
  Encounters.find().observe({
    _suppress_initial: true,
    "added": handleEncounterAdded,
    "changed": handleEncounterChanged
  });
  Segments.find().observe({
    _suppress_initial: true,
    "added": handleSegmentAdded
  });
};