define(function(require) {
    var View = require('uac/views/View');
    var TableView = require('uac/views/TableView');
    var CollapsableContentView = require('uac/views/CollapsableContentView');
    var SuppressionListItemCollection = require('sf/models/SuppressionListItemCollection');

    var uac_utils = require('uac/common/utils');
    var sf_utils = require('sf/common/utils');
    var templates = require('sf/ejs/templates');

    /**
     * View representing a row of the suppressions table view.
     */
    var SuppressionRowView = View.extend({
        events: {
            'click i.destroy': 'on_delete'
        },
        initialize: function(options) {
            var view = this;
            var link = window.location.protocol + '//' + window.location.hostname +
                (window.location.port ? ':' + window.location.port : '') + '/sf/suppressions/' + this.model.get('suppression_id');
            var html = uac_utils.run_template(templates, 'link.ejs', {link: link});

            var button = view.$el.find('i.link');
            button.popover({
                html : true,
                trigger: 'manual',
                content: html
            })
                .data('bs.popover')
                .tip()
                .addClass('link-popover');
            button.on('click', function(ev) {
                button.popover('toggle');
                $('.link-text').select();
                return false;
            });
        },
        on_delete: function (ev) {
            var view = this;
            var message = _.sprintf('Delete suppression: %s', view.model.as_string());
            if (confirm(message)) {
                view.model.destroy({
                    success: function (model, response, options) {
                        // The task was submitted successfully to delete the suppression.
                        var response_object = JSON.parse(response);
                        var task_id = response_object.task_id;

                        // Block the UI while deleting.
                        view.block();

                        view.display_success('Submitted task for delete suppression: ' + view.model.as_string());

                        // Try and wait for the task to complete.
                        sf_utils.wait_for_task(response_object.task_id, function(err, completed, response) {
                            // Unblock the UI.
                            view.unblock();

                            if (err) {
                                // Error checking the task result.
                                view.display_error(err);
                            }
                            else if (completed) {
                                // The task was completed successfully.
                                view.display_success('Successfully deleted suppression: ' +
                                    view.model.as_string());

                                // Notify that the suppression was deleted.
                                view.trigger('delete', view.model);
                            }
                            else {
                                // The task is still running.
                                var task_message = _.sprintf('The task deleting suppression: %s is still running and ' +
                                    'its results can be viewed on the <a href="/sf/tasks">Task List</a>.',
                                    view.model.as_string());
                                view.display_info(task_message);
                            }
                        });
                    },
                    error: function(model, xhr) {
                        // Error submitting the task.
                        try {
                            var message = xhr && xhr.responseText ? xhr.responseText : 'Response text not defined.';
                            view.display_error('Error while submitting delete suppression task - ' + message);
                        }
                        finally {
                            view.unblock();
                        }
                    }
                });
            }
        },
        close: function () {
            console.log('Closing row view...');
            this.$el.find('i.link').popover('destroy');
            // Manually removing the popover due to -> https://github.com/twbs/bootstrap/issues/10335
            this.$el.parent().find('.popover').remove();
            this.remove();
        }
    });

    var SuppressionsTableView = TableView.extend({
        initialize: function () {
            var view = this;

            if (!view.collection) {
                view.collection = new SuppressionListItemCollection();
            }
            view.listenTo(view.collection, 'sync', view.render);
            view.listenTo(view.collection, 'reset', view.render);

            var condensed = view.options.condensed;

            // Add a collapsable container.
            view.suppressions_collapsable = new CollapsableContentView({
                el: view.el,
                collapsed: condensed
            });
            var update_title = function () {
                // Update the suppressions collapsable count whenever the data has changed.
                var title_template = '<i class="fa fa-level-down"></i> Suppressions (%d)';
                view.suppressions_collapsable.set('title', _.sprintf(title_template, view.collection.length));
            };
            view.collection.listenTo(view.collection, 'sync', update_title);
            view.collection.listenTo(view.collection, 'reset', update_title);

            view.listenTo(view, 'load', function () {
                // Select the first row on load.
                view.select_row(0);
            });

            view.options.oLanguage = {
                sEmptyTable: 'No suppressions were found',
                sZeroRecords: 'No matching suppressions found'
            };

            if (condensed) {
                view.options.iDisplayLength = -1;

                view.options.sDom = 't';

                view.options['aoColumns'] = [
                    {sTitle: "Suppression Id", mData: 'suppression_id', bVisible: false, bSortable: false},
                    {sTitle: "Suppression", mData: 'comment', bVisible: true, bSortable: false, sClass: 'wrap'},
                    {sTitle: "Global", mData: 'cluster_name', bVisible: true, bSortable: false},
                    {sTitle: "Hits", mData: 'suppressed', bVisible: true, bSortable: false},
                    {sTitle: "Created", mData: 'created', bSortable: true, sClass: 'nowrap', visible: false}
                ];

                view.listenTo(view, 'row:created', function (row) {
                    // Escape the comment field.
                    view.escape_cell(row, 1);
                });

                view.options['aoColumnDefs'] = [
                    {
                        // `data` refers to the data for the cell (defined by `mData`, which
                        // defaults to the column being worked with, in this case is the first
                        // Using `row[0]` is equivalent.
                        mRender: function (data, type, row) {
                            var formatted = sf_utils.format_suppression(row);

                            var suppression_name = _.sprintf('<a href="/sf/suppressions/%s" onclick="ev.stopPropagation()">%s</a>',
                                row.suppression_id, formatted);

                            var delete_link = '<i class="fa fa-times-circle text-default destroy" title="Delete Suppression"></i>';

                            var link = ' <i class="fa fa-link text-default link"></i>';

                            return delete_link + ' ' + suppression_name + ' ' + link;
                        },
                        aTargets: [1]
                    },
                    {
                        mRender: function (data, type, row) {
                            if (!data) {
                                return 'Global';
                            }
                            else {
                                return data;
                            }
                        },
                        aTargets: [2]
                    }
                ];

                view.options.aaSorting = [
                    [4, 'asc']
                ];
            }
            else {
                view.options.aoColumns = [
                    {sTitle: "Suppression Id", mData: 'suppression_id', bVisible: false},
                    {sTitle: "Rule", mData: 'comment', bSortable: true, sWidth: '25%', sClass: 'wrap'},
                    {sTitle: "Description", mData: 'comment', bSortable: true, sWidth: '25%', sClass: 'wrap'},
                    {sTitle: "IOC", mData: 'iocname', bSortable: true, sClass: 'nowrap'},
                    {sTitle: "IOC UUID", mData: 'ioc_uuid', bSortable: false, bVisible: false},
                    {sTitle: "Hits", mData: 'suppressed', bSortable: true},
                    {sTitle: "Global", mData: 'cluster_name', bVisible: true, bSortable: true},
                    {sTitle: "Author", mData: 'user_uuid', bSortable: true},
                    {sTitle: "Created", mData: 'created', bSortable: true, sClass: 'nowrap'}
                ];

                view.listenTo(view, 'row:created', function (row) {
                    // Escape the comment field.
                    view.escape_cell(row, 1);
                });

                view.options.aoColumnDefs = [
                    {
                        // Add an option to the display name to g the row.
                        mRender: function (data, type, row) {
                            return '<i class="fa fa-times-circle text-default destroy" title="Delete Suppression"></i> ' +
                                sf_utils.format_suppression(row) +
                                ' <i class="fa fa-link text-default link"></i>';
                        },
                        aTargets: [1]
                    },
                    {
                        // Render global or not.
                        mRender: function (data, type, row) {
                            if (!data) {
                                return 'Global';
                            }
                            else {
                                return data;
                            }
                        },
                        aTargets: [6]
                    },
                    {
                        // Format the created date.
                        mRender: function (data, type, row) {
                            return uac_utils.format_date_string(data);
                        },
                        aTargets: [8]
                    }
                ];

                view.options.aaSorting = [
                    [8, 'asc']
                ];

                view.options.iDisplayLength = 10;
                view.options.sDom = 'lf<""t>ip';
            }

            // Keep track of the row views.
            view.suppression_row_views = [];

            view.listenTo(view, 'row:created', function (row, data, index) {
                var suppression_row = new SuppressionRowView({
                    el: $(row),
                    model: view.collection.at(index)
                });
                suppression_row.listenTo(suppression_row, 'delete', function () {
                    view.trigger('delete');
                });
                view.suppression_row_views.push(suppression_row);
            });
        },
        fetch: function (exp_key) {
            if (exp_key) {
                this.collection.exp_key = exp_key;
            }
            this.collection.fetch();
        },
        close: function () {
            console.log('Closing suppression table: ' + this.el.id + ' with ' + this.suppression_row_views.length + ' rows.');

            // Clean up the suppression row listeners.
            _.each(this.suppression_row_views, function (row) {
                row.close();
            });
            this.suppression_row_views = [];

            // Destroy the suppressions datatable.
            this.destroy();

            // Remove any current listeners.
            this.stopListening();
        }
    });

    return SuppressionsTableView;
});