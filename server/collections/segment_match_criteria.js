SegmentMatchCriteria = function(criteria) {
  this.criteria = criteria;
};

SegmentMatchCriteria.prototype.match = function(companyId, visitorId) {
  var criteria = this.criteria;

  this.now = new Date();
  this.installationIds = new TriggerLocation(companyId, criteria.triggerLocations, criteria.locationIds).installationIds();

  this.encounterSelector = {
    visitorId: visitorId,
    installationId: { $in: this.installationIds }
  };

  this.updateEncounterSelectorByCriteriaDays();
  this.updateEncounterSelectorByCriteriaEvery();
  this.updateEncounterSelectorByCriteriaDuationInMinutes();

  if (criteria.hasBeen && criteria.to === "all") {
    return this.matchHasBeenToAll();
  } else if (criteria.hasBeen && criteria.to === "any") {
    var result = this.matchHasBeenToAny();
//    console.info('[SegmentMatchCriteria] Match result:', companyId, visitorId, result);
    return result;
  } else if (!criteria.hasBeen && criteria.to === "all") {
    return this.matchNotHasBeenAll();
  } else if (!criteria.hasBeen && criteria.to === "any") {
    return this.matchNotHasBeenAny();
  }
};

/**
 * encounters should be sorted by exitedAt
 */
SegmentMatchCriteria.prototype.matchBeenAll = function(installationIds, encounters, criteria) {
  function isInstallationMatch(criteria, encounterCount) {
    return (encounterCount && (
         (criteria.times.atLeast && encounterCount >= criteria.times.atLeast) ||
         (criteria.times.atMost && encounterCount <= criteria.times.atMost)
        )); 
  }

  var counters = {};
  var okCount = 0;
  _.each(encounters, function(encounter) {
    counters[encounter.installationId] = (counters[encounter.installationId] || 0) + 1;
  });

  // loop installations, and see how many of them match the requirement
  _.each(installationIds, function(installationId) {
    var encounterCount = counters[installationId];
    if (isInstallationMatch(criteria, counters[installationId])) okCount++;
  });

  // segment is matched, if all installations are matched
  var result = {
    isMatched: (okCount == installationIds.length),
    nextEnter: null,
    nextExit: null
  }

  // quick check to see if nextEnter, or nextExit is possible
  if (!criteria.days) return result;
  if (!criteria.days.inLast) return result;
  if (result.isMatched && !criteria.times.atLeast) return result;
  if (!result.isMatched && !criteria.times.atMost) return result;

  // loop through the encounters, and remove them one by one, until the segment matched condition is changed
  _.each(encounters, function(encounter) {
    var invalidTime = moment(encounter.exitedAt).add(criteria.days.inLast, 'days').toDate();
    var matchBefore = isInstallationMatch(criteria, counters[encounter.installationId]);
    counters[encounter.installationId]--;
    var matchAfter = isInstallationMatch(criteria, counters[encounter.installationId]);
    if (matchBefore && !matchAfter) {
      result.nextExit = invalidTime;
      return false;
    }
    if (!matchBefore && matchAfter) {
      okCount++;
      if (okCount == installationIds.length) {
        result.nextEnter = invalidTime;
        return false;
      } 
    }
  });

  return result;
}

SegmentMatchCriteria.prototype.matchHasBeenToAll = function() {
  var criteria = this.criteria;
  var installationEncounterCounter = this.getInstallationEncounterCounter();
  var result = true;
  _.each(this.installationIds, function(installationId) {
    var encounterCount = installationEncounterCounter[installationId];
    if (!encounterCount
      || (criteria.times.atLeast && encounterCount < criteria.times.atLeast)
      || (criteria.times.atMost && encounterCount > criteria.times.atMost)) {
      result = false;
      return false;
    }
  });
  return result;
};

SegmentMatchCriteria.prototype.matchHasBeenToAny = function() {
  var installationEncounterCounter = this.getInstallationEncounterCounter();
  var criteria = this.criteria;

  var result = false;
  _.each(this.installationIds, function(installationId) {
    var encounterCount = installationEncounterCounter[installationId];
    if ((criteria.times.atLeast && encounterCount >= criteria.times.atLeast)
      || (criteria.times.atMost && encounterCount <= criteria.times.atMost)) {
//      console.log("[SegmentMatchCriteria] matchHasBeenToAny:", criteria.times.atLeast, criteria.times.atLeast);
      result = true;
      return false;
    }
  });
  return result;
};

SegmentMatchCriteria.prototype.matchNotHasBeenAll = function() {
  var installationEncounterCounter = this.getInstallationEncounterCounter();

  var result = true;
  _.each(this.installationIds, function(installationId) {
    var encounterCount = installationEncounterCounter[installationId];
    if (encounterCount) {
      result = false;
      return false;
    }
  });
  return result;
};

SegmentMatchCriteria.prototype.matchNotHasBeenAny = function() {
  var installationEncounterCounter = this.getInstallationEncounterCounter();

  var result = false;
  _.each(this.installationIds, function(installationId) {
    var encounterCount = installationEncounterCounter[installationId];
    if (!encounterCount) {
//      console.log("[SegmentMatchCriteria] matchNotHasBeenAny:", installationId);
      result = true;
      return false;
    }
  });
  return result;
};

SegmentMatchCriteria.prototype.getInstallationEncounterCounter = function() {
  var installationEncounterCounter = {};
  Encounters.find(this.encounterSelector).forEach(function(encounter) {
    var installationId = encounter.installationId;
    installationEncounterCounter[installationId] = (installationEncounterCounter[installationId] || 0) + 1;
  });
//  console.info('[SegmentMatchCriteria] Get installation encounter counter:', JSON.stringify(this.encounterSelector), installationEncounterCounter);
  return installationEncounterCounter;
};

SegmentMatchCriteria.prototype.updateEncounterSelectorByCriteriaDays = function() {
  var self = this;
  var criteria = self.criteria;
  var days = criteria.days;

  if (!days) {
    return;
  }

  if (days.inLast) {
    self.encounterSelector.enteredAt = {
      $gte: +moment(self.now).subtract(days.inLast, 'days')
    };
  } else {
    self.encounterSelector.enteredAt = {
      $gte: days.start,
      $lte: days.end
    };
  }
};

SegmentMatchCriteria.prototype.updateEncounterSelectorByCriteriaEvery = function() {
  var encounterSelector = this.encounterSelector;

  switch (this.criteria.every) {
    case "weekdays":
      encounterSelector["enteredAtParts.dayOfWeek"] = { $gte: 1, $lte: 5 };
      break;
    case "weekends":
      encounterSelector["enteredAtParts.dayOfWeek"] = { $in: [0, 6] };
      break;
    case "day":
      break;
  }
};

SegmentMatchCriteria.prototype.updateEncounterSelectorByCriteriaDuationInMinutes = function() {
  var criteria = this.criteria;
  var encounterSelector = this.encounterSelector;

  if (!criteria.hasBeen) {
    return;
  }

  var durationInMinutes = criteria.durationInMinutes;
  if (durationInMinutes) {
    encounterSelector.duration = {};
    if (durationInMinutes.atLeast) {
      encounterSelector.duration.$gte = durationInMinutes.atLeast * 60 * 1000;
    }
    if (durationInMinutes.atMost) {
      encounterSelector.duration.$lte = durationInMinutes.atMost * 60 * 1000;
    }
  }
};
