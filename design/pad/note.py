import pystache

template = """
<!DOCTYPE html>
<html>
  <head>
  <link href="/ethercouch/_design/pad/BespinEmbedded.css" type="text/css" rel="stylesheet">
  <script type="text/javascript" src="/ethercouch/_design/pad/BespinEmbedded.js"></script>
  <script type="text/javascript" src="http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.min.js"></script>
  <script type="text/javascript" src="/ethercouch/_design/pad/jquery.couch.js"></script>
  <style>
    body { padding: 20px; font-family: Calibri, Helvetica, Arial; }
    h1 { border-bottom: 1px solid #ddd; font-size:120%; }
    .bespin { margin: 0; padding: 0; border: 0; height: 300px; border: 10px solid #ddd; -moz-border-radius: 10px; -webkit-border-radius: 10px; }
  </style>
  </head>
  <body>

    <div id="editor" class="bespin" data-bespin-options='{ "stealFocus": true }'>{{currentText}}
    </div>
  
    <script type="text/javascript">
    docid = "{{docid}}"
    db = $.couch.db('ethercouch');
    
    window.onBespinLoad = function() {
        bespin = document.getElementById("editor").bespin;
        
        var push = function () {
          if (bespin.getContent() != window.doc.currentText) {
            doc.currentText = bespin.getContent();
            db.saveDoc(doc, {success:function(doc){push();}})
          } else {
            setTimeout(push, 500);
          }
        }
        db.openDoc(docid, {'success':function(doc){window.doc = doc; bespin.setContent(doc.currentText); push();}});
        
        // bespin.setContent('foo')
        // text = bespin.getContent()
        // var original = bespin.editorView.cursorDidMove;
        // var onchange = function () {
        //   original.apply(this, arguments);
        //   var currentText = bespin.getContent();
        //   doc.currentText = currentText;
        //   db.saveDoc(doc);
        // }
        // bespin.editorView.cursorDidMove = onchange;
    };
    var updateBespin = function (data) {
      if (data['id'] == window.doc._id && data.changes[data.changes.length - 1]['rev'] != window.doc._rev) {
        db.openDoc(docid, {success:function(doc){bespin.setContent(doc.currentText); window.doc = doc}});
      }
    }
    changes = db.changes({feed:'continuous'});
    changes.addListener(updateBespin);
    changes.start();
    
    </script>
  
  </body>
</html>
"""

@show_function
def show_note(doc, req):
    return {'body':pystache.render(template, {'docid':doc['_id'], 'currentText':doc.get('currentText','')}),
            'headers':{'Content-Type':'text/html'}}