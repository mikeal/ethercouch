
template = """
<!DOCTYPE html>
<html>
  <head>
  <link href="/ethercouch/_design/pad/BespinEmbedded.css" type="text/css" rel="stylesheet">
  <script type="text/javascript" src="/ethercouch/_design/pad/BespinEmbedded.js"></script>
  <script type="text/javascript" src="http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.min.js"></script>
  <script type="text/javascript" src="/ethercouch/_design/pad/jquery.couch.js"></script>

  </head>
  <body>

    <div id="editor" class="bespin" data-bespin-options='{ "stealFocus": true }'>
    </div>
  
    <script type="text/javascript">
    window.onBespinLoad = function() {
        console.log("this is called when Bespin is loaded");
        bespin = document.getElementById("editor").bespin;
        // bespin.setContent('foo')
        // text = bespin.getContent()
        var original = bespin.editorView.cursorDidMove;
        var onchange = function () {
          original.apply(this, arguments);
          var currentText = bespin.getContent();

        }
        bespin.editorView.cursorDidMove = onchange;
    };
    
    var db = $.couch.db('ethercouch');
    var changes = db.changes();
    changes.start();
    </script>
  
  </body>
</html>
"""

@show_function
def show_note(doc, req):
    return {'body':template,'headers':{'Content-Type':'text/html'}}