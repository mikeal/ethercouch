// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License. You may obtain a copy of
// the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations under
// the License.

(function($) {
  $.couch = $.couch || {};

  function encodeDocId(docID) {
    var parts = docID.split("/");
    if (parts[0] == "_design") {
      parts.shift();
      return "_design/" + encodeURIComponent(parts.join('/'));
    }
    return encodeURIComponent(docID);
  }

  uuidCache = [];

  $.extend($.couch, {
    activeTasks: function(options) {
      ajax(
        {url: "/_active_tasks"},
        options,
        "Active task status could not be retrieved"
      );
    },

    allDbs: function(options) {
      ajax(
        {url: "/_all_dbs"},
        options,
        "An error occurred retrieving the list of all databases"
      );
    },

    config: function(options, section, option, value) {
      var req = {url: "/_config/"};
      if (section) {
        req.url += encodeURIComponent(section) + "/";
        if (option) {
          req.url += encodeURIComponent(option);
        }
      }
      if (value !== undefined) {
        req.type = "PUT";
        req.data = toJSON(value);
        req.contentType = "application/json";
        req.processData = false
      }

      ajax(req, options,
        "An error occurred retrieving/updating the server configuration"
      );
    },

    // TODO make login/logout and db.login/db.logout DRY
    login: function(options) {
      options = options || {};
      $.ajax({
        type: "POST", url: "/_login", dataType: "json",
        data: {username: options.username, password: options.password},
        complete: function(req) {
          var resp = $.httpData(req, "json");
          if (req.status == 200) {
            if (options.success) options.success(resp);
          } else if (options.error) {
            options.error(req.status, resp.error, resp.reason);
          } else {
            alert("An error occurred logging in: " + resp.reason);
          }
        }
      });
    },
    logout: function(options) {
      options = options || {};
      $.ajax({
        type: "POST", url: "/_logout", dataType: "json",
        complete: function(req) {
          var resp = $.httpData(req, "json");
          if (req.status == 200) {
            if (options.success) options.success(resp);
          } else if (options.error) {
            options.error(req.status, resp.error, resp.reason);
          } else {
            alert("An error occurred logging out: " + resp.reason);
          }
        }
      });
    },

    db: function(name) {
      return {
        name: name,
        uri: "/" + encodeURIComponent(name) + "/",

        changes: function(options) {
          var curi = this.uri + '_changes';
          if (!options) {
            var options = {};
          }           
          if (!options.interval) {
            options.interval = 5;
          }
          if (!options.feed) {
            if (jQuery.browser.mozilla) {
              options.feed = "continuous";
            } else if (jQuery.browser.safari) {
              options.feed = "continuous";
            } else if (jQuery.browser.msie) {
              options.feed = "longpoll";
            }
          }
          var dburi = this.uri;
          var db = this;
          var retVal = {
            uri          : curi,
            db           : db,
            seq          : options.seq,
            dburi        : dburi,
            listeners    : [],
            options      : options,
            interval     : options.interval,
            addListener  : function (func) {
              this.listeners.push(func);
            },
            getUri       : function () {
              var changesUri = this.uri;
              var q = []
              if (this.options.feed) {
                q.push('feed='+this.options.feed);
              } 
              if (this.seq) {
                q.push('since='+this.seq);
              }
              if (this.options.query) {
                jQuery.each(this.options.query, function(k, v){q.push(k+'='+v)});
              }
              if (this.options.filter) {
                q.push('filter='+this.options.filter);
              }
              if (this.options.include_docs) {
                q.push('include_docs=true');
              }
              if (q.length != 0) {
                changesUri += '?';
                changesUri += q.join('&');
              }
              
              return changesUri;
            },
            start        : function () {
              var c = this;
              if (this.options.feed == 'continuous') {
                var dispatch = function(xhr) {
                  if (this.readyState == 4) {
                    startContinuous();
                  }
                  var splitText = jQuery.grep(xhr.target.responseText.split('\n'), function(v){return (v != '')})
                  var text = splitText[splitText.length - 1];
                  if (text != c._lastLine) {
                    c._lastLine = text
                    var data = JSON.parse(text);
                    c.seq = data.seq;
                    jQuery.each(c.listeners, function(i, listener){listener(data)});
                  }
                }
                var startContinuous = function() {
                  var c_xhr = jQuery.ajaxSettings.xhr();
                  c_xhr.open("GET", c.getUri()+'&timeout=60000', true);
                  c_xhr.send("");
                  c_xhr.onreadystatechange = dispatch;
                  // var resetHXR = function () {c_xhr.abort(); startContinuous();};
                  // setTimeout(resetHXR, 1000 * 60);
                }
                if (!c.seq) {
                  c.ajax = jQuery.ajax({url:c.dburi, success:function(result){
                    c.seq = JSON.parse(result)['update_seq'];
                    startContinuous();
                    }
                  });
                } else {
                  startContinuous();
                }
                
              } else {
                // poll type
                var dispatch = function (result) {
                  response = JSON.parse(result);
                  c.seq = response['last_seq'];
                  for (i in response['results']) {
                    var data = response['results'][i];
                    jQuery.each(c.listeners, function(i, listener){listener(data)})
                  } 
                  setTimeout(function() {c.ajax = jQuery.ajax({url:c.getUri(),success:dispatch})}, c.interval * 1000);
                }
                if (!c.seq) {
                  var setSeq = function(result) {
                    c.seq = JSON.parse(result)['update_seq'];
                    c.ajax = jQuery.ajax({url:c.getUri(),success:dispatch});
                  }
                  c.ajax = jQuery.ajax({url:c.dburi, success:setSeq})
                } else {
                  c.ajax = jQuery.ajax({url:c.getUri(),success:dispatch});
                }
              }
            },
          };
          return retVal;
        },
        
        compact: function(options) {
          $.extend(options, {successStatus: 202});
          ajax({
              type: "POST", url: this.uri + "_compact",
              data: "", processData: false
            },
            options,
            "The database could not be compacted"
          );
        },
        compactView: function(groupname, options) {
          $.extend(options, {successStatus: 202});
          ajax({
              type: "POST", url: this.uri + "_compact/" + groupname,
              data: "", processData: false
            },
            options,
            "The view could not be compacted"
          );
        },
        create: function(options) {
          $.extend(options, {successStatus: 201});
          ajax({
              type: "PUT", url: this.uri, contentType: "application/json",
              data: "", processData: false
            },
            options,
            "The database could not be created"
          );
        },
        drop: function(options) {
          ajax(
            {type: "DELETE", url: this.uri},
            options,
            "The database could not be deleted"
          );
        },
        info: function(options) {
          ajax(
            {url: this.uri},
            options,
            "Database information could not be retrieved"
          );
        },
        allDocs: function(options) {
          ajax(
            {url: this.uri + "_all_docs" + encodeOptions(options)},
            options,
            "An error occurred retrieving a list of all documents"
          );
        },
        allDesignDocs: function(options) {
          this.allDocs($.extend({startkey:"_design", endkey:"_design0"}, options));
        },
        allApps: function(options) {
          options = options || {};
          var self = this;
          if (options.eachApp) {
            this.allDesignDocs({
              success: function(resp) {
                $.each(resp.rows, function() {
                  self.openDoc(this.id, {
                    success: function(ddoc) {
                      var index, appPath, appName = ddoc._id.split('/');
                      appName.shift();
                      appName = appName.join('/');
                      index = ddoc.couchapp && ddoc.couchapp.index;
                      if (index) {
                        appPath = ['', name, ddoc._id, index].join('/');
                      } else if (ddoc._attachments && ddoc._attachments["index.html"]) {
                        appPath = ['', name, ddoc._id, "index.html"].join('/');
                      }
                      if (appPath) options.eachApp(appName, appPath, ddoc);
                    }
                  });
                });
              }
            });
          } else {
            alert("please provide an eachApp function for allApps()");
          }
        },
        openDoc: function(docId, options, ajaxOptions) {
          ajax({url: this.uri + encodeDocId(docId) + encodeOptions(options)},
            options,
            "The document could not be retrieved",
            ajaxOptions
          );
        },
        saveDoc: function(doc, options) {
          options = options || {};
          if (doc._id === undefined) {
            var method = "POST";
            var uri = this.uri;
          } else {
            var method = "PUT";
            var uri = this.uri + encodeDocId(doc._id);
          }
          $.ajax({
            type: method, url: uri + encodeOptions(options),
            contentType: "application/json",
            dataType: "json", data: toJSON(doc),
            complete: function(req) {
              var resp = $.httpData(req, "json");
              if (req.status == 201) {
                doc._id = resp.id;
                doc._rev = resp.rev;
                if (options.success) options.success(resp);
              } else if (options.error) {
                options.error(req.status, resp.error, resp.reason);
              } else {
                alert("The document could not be saved: " + resp.reason);
              }
            }
          });
        },
        bulkSave: function(docs, options) {
          $.extend(options, {successStatus: 201});
          ajax({
              type: "POST",
              url: this.uri + "_bulk_docs" + encodeOptions(options)
            },
            options,
            "The documents could not be saved"
          );
        },
        removeDoc: function(doc, options) {
          ajax({
              type: "DELETE",
              url: this.uri +
                   encodeDocId(doc._id) +
                   encodeOptions({rev: doc._rev})
            },
            options,
            "The document could not be deleted"
          );
        },
        copyDoc: function(doc, options, ajaxOptions) {
          ajaxOptions = $.extend(ajaxOptions, {
            complete: function(req) {
              var resp = $.httpData(req, "json");
              if (req.status == 201) {
                doc._id = resp.id;
                doc._rev = resp.rev;
                if (options.success) options.success(resp);
              } else if (options.error) {
                options.error(req.status, resp.error, resp.reason);
              } else {
                alert("The document could not be copied: " + resp.reason);
              }
            }
          });
          ajax({
              type: "COPY",
              url: this.uri +
                   encodeDocId(doc._id) +
                   encodeOptions({rev: doc._rev})
            },
            options,
            "The document could not be copied",
            ajaxOptions
          );
        },
        query: function(mapFun, reduceFun, language, options) {
          language = language || "javascript";
          if (typeof(mapFun) !== "string") {
            mapFun = mapFun.toSource ? mapFun.toSource() : "(" + mapFun.toString() + ")";
          }
          var body = {language: language, map: mapFun};
          if (reduceFun != null) {
            if (typeof(reduceFun) !== "string")
              reduceFun = reduceFun.toSource ? reduceFun.toSource() : "(" + reduceFun.toString() + ")";
            body.reduce = reduceFun;
          }
          ajax({
              type: "POST",
              url: this.uri + "_temp_view" + encodeOptions(options),
              contentType: "application/json", data: toJSON(body)
            },
            options,
            "An error occurred querying the database"
          );
        },
        view: function(name, options) {
          var name = name.split('/');
          var options = options || {};
          var type = "GET";
          var data= null;
          if (options["keys"]) {
            type = "POST";
            var keys = options["keys"];
            delete options["keys"];
            data = toJSON({ "keys": keys });
          }
          ajax({
              type: type,
              data: data,
              url: this.uri + "_design/" + name[0] +
                   "/_view/" + name[1] + encodeOptions(options)
            },
            options, "An error occurred accessing the view"
          );
        }
      };
    },

    encodeDocId: encodeDocId, 

    info: function(options) {
      ajax(
        {url: "/"},
        options,
        "Server information could not be retrieved"
      );
    },

    replicate: function(source, target, options) {
      ajax({
          type: "POST", url: "/_replicate",
          data: JSON.stringify({source: source, target: target}),
          contentType: "application/json"
        },
        options,
        "Replication failed"
      );
    },

    newUUID: function(cacheNum) {
      if (cacheNum === undefined) {
        cacheNum = 1;
      }
      if (!uuidCache.length) {
        ajax({url: "/_uuids", data: {count: cacheNum}, async: false}, {
            success: function(resp) {
              uuidCache = resp.uuids
            }
          },
          "Failed to retrieve UUID batch."
        );
      }
      return uuidCache.shift();
    }

  });

  function ajax(obj, options, errorMessage, ajaxOptions) {
    options = $.extend({successStatus: 200}, options);
    errorMessage = errorMessage || "Unknown error";

    $.ajax($.extend($.extend({
      type: "GET", dataType: "json",
      complete: function(req) {
        var resp = $.httpData(req, "json");
        if (req.status == options.successStatus) {
          if (options.success) options.success(resp);
        } else if (options.error) {
          options.error(req.status, resp.error, resp.reason);
        } else {
          alert(errorMessage + ": " + resp.reason);
        }
      }
    }, obj), ajaxOptions));
  }

  // Convert a options object to an url query string.
  // ex: {key:'value',key2:'value2'} becomes '?key="value"&key2="value2"'
  function encodeOptions(options) {
    var buf = [];
    if (typeof(options) === "object" && options !== null) {
      for (var name in options) {
        if ($.inArray(name, ["error", "success"]) >= 0)
          continue;
        var value = options[name];
        if ($.inArray(name, ["key", "startkey", "endkey"]) >= 0) {
          value = toJSON(value);
        }
        buf.push(encodeURIComponent(name) + "=" + encodeURIComponent(value));
      }
    }
    return buf.length ? "?" + buf.join("&") : "";
  }

  function toJSON(obj) {
    return obj !== null ? JSON.stringify(obj) : null;
  }

})(jQuery);



