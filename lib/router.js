Router.configure({
  layoutTemplate: 'basicLayout',
  notFoundTemplate: 'notFound',
  loadingTemplate: 'loading',
  yieldTemplates: {
    'header': { to: 'header' },
    'footer': { to: 'footer' }
  }
});

// Controllers are defined in `route_controllers/`
Router.map(function () {
  this.route('home', {
    path: '/',
    controller: HomeController
  });

  this.route('segment.list', {
    path: '/segments',
    controller: SegmentListController
  });

  this.route('segment.create', {
    path: '/segments/create',
    controller: SegmentCreateController
  });

  this.route('segment.detail', {
    path: '/segments/:segmentId',
    controller: SegmentDetailController
  });
  this.route('loading', {
    path: '/loading'
  })
});
