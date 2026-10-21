from mangum import Mangum

from referee_core.api import app

handler = Mangum(app, lifespan="off")
