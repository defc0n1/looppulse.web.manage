SegmentMetric.startup = function () {
  function upsertSegmentMetric(segmentId, modifier) {
    var selector = {
      type: SegmentMetric.type,
      resolution: Metric.forever,
      segmentId: segmentId
    };
    Metrics.upsert(selector, _.extend({}, modifier, {
      $setOnInsert: selector
    }));
  }

  function handleSegmentVisitorAdded(segmentVisitor) {
    var visitorMetric = VisitorMetrics.findOneByVisitor(segmentVisitor.visitorId);
    upsertSegmentMetric(segmentVisitor.segmentId, {
      $inc: {
        visitorCount: 1,
        visitCount: visitorMetric.visitCount,
        dwellTime: visitorMetric.dwellTime
      }
    });
  }

  function handleSegmentVisitorRemoved(oldSegmentVisitor) {
    var visitorMetric = VisitorMetrics.findOneByVisitor(oldSegmentVisitor.visitorId);
    // FIXME can be negative if added event is not processed
    upsertSegmentMetric(oldSegmentVisitor.segmentId, {
      $inc: {
        visitorCount: -1,
        visitCount: visitorMetric.visitCount * -1,
        dwellTime: visitorMetric.dwellTime * -1
      }
    });
  }

  SegmentVisitors.find().observe({
    _suppress_initial: true,
    added: handleSegmentVisitorAdded,
    removed: handleSegmentVisitorRemoved
  });

  // FIXME observe VisitorMetrics for updates
};
