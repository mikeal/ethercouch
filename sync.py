import couchquery
import os

design_dir = os.path.join(os.path.dirname(__file__), 'design')

db = couchquery.Database('http://localhost:5984/ethercouch')

for d in os.listdir(design_dir):
    db.sync_design_doc(d, os.path.join(design_dir, d), 'python')
