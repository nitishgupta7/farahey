;(function() {

    var root = this;
    var jsMagnetize;
    if (typeof exports !== 'undefined') {
        jsMagnetize = exports;
    } else {
        jsMagnetize = root.jsMagnetize = {};
    } 

    var _isOnEdge = function(r, axis, dim, v) { return (r[axis] <= v && v <= r[axis] + r[dim]); },
        _xAdj = [ function(r1, r2) { return r1.x + r1.w - r2.x; }, function(r1, r2) { return r1.x - (r2.x + r2.w); } ],
        _yAdj = [ function(r1, r2) { return r1.y + r1.h - r2.y; }, function(r1, r2) { return r1.y - (r2.y + r2.h); } ],
        _adj = [ null, [ _xAdj[0], _yAdj[1] ], [ _xAdj[0], _yAdj[0] ], [ _xAdj[1], _yAdj[0] ], [ _xAdj[1], _yAdj[1] ] ],                  
        _genAdj = function(r1, r2, m, b, s) {
            if (isNaN(m)) m = 0;
            var y = r2.y + r2.h, 
                x = (m == Infinity || m == -Infinity) ? r2.x + (r2.w / 2) :  (y - b) / m,
                theta = Math.atan(m);

            if (_isOnEdge(r2, "x", "w", x)) {   
                var rise = _adj[s][1](r1, r2), 
                    hyp = rise / Math.sin(theta),
                    run = hyp * Math.cos(theta);
                return { left:run, top:rise };
            }           
            else {
                var run = _adj[s][0](r1, r2),
                    hyp = run / Math.cos(theta),
                    rise = hyp * Math.sin(theta);
                return { left:run, top:rise };
            }
        },            
        /*
        * Calculates how far to move r2 from r1 so that it no longer overlaps. Used by magnetize, and by the circular layout.                    
        * if angle is supplied, then it means we want r2 to move along a vector at that angle. otherwise we want it
        * to move along a vector joining the two rectangle centers.
        */
        _calculateSpacingAdjustment = jsMagnetize.calculateSpacingAdjustment = function(r1, r2, angle) {
            var m,b,s;
            if (angle == null) {
                var c1 = [ r1.x + (r1.w / 2), r1.y + (r1.h / 2) ],
                    c2 = [ r2.x + (r2.w / 2), r2.y + (r2.h / 2) ];
                m = jsPlumbGeom.gradient(c1, c2),
                s = jsPlumbGeom.quadrant(c1, c2),
                b = (m == Infinity || m == -Infinity || isNaN(m)) ? 0 : c1[1] - (m * c1[0]);
            }
            else {
                m = angle.dy / angle.dx;
                s = angle.s;
                b = (m == Infinity || m == -Infinity || isNaN(m)) ? 0 : angle.y - (m * angle.x);
            }
                    
            return _genAdj(r1, r2, m, b, s);        
        },    
        // calculate a padded rectangle for the given element with offset & size, and desired padding.
        _paddedRectangle = jsMagnetize.paddedRectangle = function(o, s, p) {
            return { x:o[0] - p[0], y: o[1] - p[1], w:s[0] + (2 * p[0]), h:s[1] + (2 * p[1]) };
        },
        _magnetize = function(positionArray, positions, sizes, padding, constrain, origin, filter) {                        
            origin = origin || [0,0];

            var focus = _paddedRectangle(origin, [1,1], padding),
                iterations = 100, iteration = 1, uncleanRun = true, adjustBy, constrainedAdjustment;

            while (uncleanRun && iteration < iterations) {
                uncleanRun = false;
                for (var i = 0; i < positionArray.length; i++) {
                    var o1 = positions[positionArray[i][1]],
                        oid = positionArray[i][1],
                        a1 = positionArray[i][2], // angle to node from magnet origin
                        s1 = sizes[positionArray[i][1]],
                        // create a rectangle for first element: this encompasses the element and padding on each
                        //side
                        r1 = _paddedRectangle(o1, s1, padding);

                    if (filter(positionArray[i][1]) && jsPlumbGeom.intersects(focus, r1)) {                                                                                                 
                        adjustBy = _calculateSpacingAdjustment(focus, r1);
                        constrainedAdjustment = constrain(positionArray[i][1], o1, adjustBy);
                        o1[0] += (constrainedAdjustment.left + 1);
                        o1[1] += (constrainedAdjustment.top + 1);
                    }

                    //now move others to account for this one, if necessary.
                    // reset rectangle for node
                    r1 = _paddedRectangle(o1, s1, padding);
                    for (var j = 0; j < positionArray.length; j++) {                        
                        if (i != j) {
                          var o2 = positions[positionArray[j][1]],
                              a2 = positionArray[j][2], // angle to node from magnet origin
                              s2 = sizes[positionArray[j][1]],
                              // create a rectangle for the second element, again by putting padding of the desired
                              // amount around the bounds of the element.
                              r2 = _paddedRectangle(o2, s2, padding);
                    
                          // if the two rectangles intersect then figure out how much to move the second one by.
                            if (filter(positionArray[j][1]) && jsPlumbGeom.intersects(r1, r2)) {                                   
                                uncleanRun = true;                                                                          
                                adjustBy = _calculateSpacingAdjustment(r1, r2),
                                constrainedAdjustment = constrain(positionArray[j][1], o2, adjustBy);
                                o2[0] += (constrainedAdjustment.left + 1);
                                o2[1] += (constrainedAdjustment.top + 1);
                            }
                        }
                    } 
                }
                iteration++;
            }                     
        };


        /**
        * @name Magnetizer
        * @classdesc Applies repulsive magnetism to a set of elements relative to a given point, with a specified
        * amount of padding around the point.
        */

        /**
        * @name Magnetizer#constructor
        * @function
        * @param {Selector|Element} [container] Element that contains the elements to magnetize. Only required if you intend to use the `executeAtEvent` method.
        * @param {Function} [getContainerPosition] Function that returns the position of the container (as an object of the form `{left:.., top:..}`) when requested. Only required if you intend to use the `executeAtEvent` method.
        * @param {Function} getPosition A function that takes an element id and returns its position. It does not matter to which element this position is computed as long as you remain consistent with this method, `setPosition` and the `origin` property.
        * @param {Function} setPosition A function that takes an element id and position, and sets it. See note about offset parent above.
        * @param {Function} getSize A function that takes an element id and returns its size, in pixels.
        * @param {Integer[]} [padding] Optional padding for x and y directions. Defaults to 20 pixels in each direction.
        * @param {Function} [constrain] Optional function that takes an id and a proposed amount of movement in each axis, and returns the allowed amount of movement in each axis. You can use this to constrain your elements to a grid, for instance, or a path, etc.
        * @param {Integer[]} [origin] The origin of magnetization, in pixels. Defaults to 0,0. You can also supply this to the `execute` call.
        * @param {Selector|String[]|Element[]} elements List of elements on which to operate.
        * @param {Boolean} [executeNow=false] Whether or not to execute the routine immediately.
        */
        root.Magnetizer = function(params) {
            var getPosition = params.getPosition,
                getSize = params.getSize,
                getId = params.getId,
                setPosition = params.setPosition,
                padding = params.padding ||  [20, 20],
                // expects a { left:.., top:... } object. returns how far it can actually go.
                constrain = params.constrain || function(id, current, delta) { return delta; },
                positionArray = [],
                positions = {},
                sizes = {},
                elements = params.elements || [],
                origin = params.origin || [0,0],
                executeNow = params.executeNow,
                minx, miny, maxx, maxy,
                getOrigin = this.getOrigin = function() { return origin; },
                filter = params.filter || function(_) { return true; };

            var _updatePositions = function() {
                positionArray = []; positions = {}; sizes = {};
                minx = miny = Infinity;
                maxx = maxy = -Infinity;
                for (var i = 0; i < elements.length; i++) {
                    var p = getPosition(elements[i]),
                        s = getSize(elements[i]),
                        id = getId(elements[i]);

                    positions[id] = [p.left, p.top];
                    positionArray.push([ [p.left, p.top], id]);
                    sizes[id] = s;
                    minx = Math.min(minx, p.left);
                    miny = Math.min(miny, p.top);
                    maxx = Math.max(maxx, p.left + s[0]);
                    maxy = Math.max(maxy, p.top + s[1]);
                }
            };

            var _run = function() {
                if (elements.length > 1) {
                    _magnetize(positionArray, positions, sizes, padding, constrain, origin, filter);
                    _positionElements();
                }
            };

            var _positionElements = function() {
                for (var i = 0; i < elements.length; i++) {
                    var id = getId(elements[i]);
                    setPosition(elements[i], { left:positions[id][0], top:positions[id][1] });
                }
            };

            /**
            * @name Magnetizer#execute
            * @function
            * @desc Runs the magnetize routine.
            * @param {Integer[]} [o] Optional origin to use. You may have set this in the constructor and do not wish to supply it, or you may be happy with the default of [0,0].
            */
            this.execute = function(o) {
                if (o != null) origin = o;                            
                _updatePositions();
                _run();
            };

            if (executeNow) this.execute();

            /**
            * @name Magnetizer#executeAtCenter
            * @function
            * @desc Computes the center of all the nodes and then uses that as the magnetization origin when it runs the routine.
            */
            this.executeAtCenter = function() {
                _updatePositions();
                origin = [
                    (minx + maxx) / 2,
                    (miny + maxy) / 2
                ];
                _run();
            };

            /**
            * @name Magnetizer#executeAtEvent
            * @function
            * @desc Runs the magnetize routine using the location of the given event as the origin. To use this
            * method you need to have provided a `container`,  and a `getContainerPosition` function to the
            * constructor.
            * @param {Event} e Event to get origin location from.
            */
            this.executeAtEvent = function(e) {
                var c = params.container, 
                    o = params.getContainerPosition(c),
                    x = e.pageX - o.left + c[0].scrollLeft, 
                    y = e.pageY - o.top + c[0].scrollTop;
                this.execute([x,y]);
            };

            /**
            * @name Magnetize#setElements
            * @function
            * @desc Sets the current list of elements.
            * @param {Object[]} _els List of elements, in whatever format the magnetizer is setup to use.
            */
            this.setElements = function(_els) {
                elements = _els;
            };
        };

}).call(this);        
