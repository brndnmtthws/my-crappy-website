// script.aculo.us effects.js v1.8.1, Thu Jan 03 22:07:12 -0500 2008

// Copyright (c) 2005-2007 Thomas Fuchs (http://script.aculo.us, http://mir.aculo.us)
// Contributors:
//  Justin Palmer (http://encytemedia.com/)
//  Mark Pilgrim (http://diveintomark.org/)
//  Martin Bialasinki
// 
// script.aculo.us is freely distributable under the terms of an MIT-style license.
// For details, see the script.aculo.us web site: http://script.aculo.us/ 

// converts rgb() and #xxx to #xxxxxx format,  
// returns self (or first argument) if not convertable  
String.prototype.parseColor = function() {  
  var color = '#';
  if (this.slice(0,4) == 'rgb(') {  
    var cols = this.slice(4,this.length-1).split(',');  
    var i=0; do { color += parseInt(cols[i]).toColorPart() } while (++i<3);  
  } else {  
    if (this.slice(0,1) == '#') {  
      if (this.length==4) for(var i=1;i<4;i++) color += (this.charAt(i) + this.charAt(i)).toLowerCase();  
      if (this.length==7) color = this.toLowerCase();  
    }  
  }  
  return (color.length==7 ? color : (arguments[0] || this));  
};

/*--------------------------------------------------------------------------*/

Element.collectTextNodes = function(element) {  
  return $A($(element).childNodes).collect( function(node) {
    return (node.nodeType==3 ? node.nodeValue : 
      (node.hasChildNodes() ? Element.collectTextNodes(node) : ''));
  }).flatten().join('');
};

Element.collectTextNodesIgnoreClass = function(element, className) {  
  return $A($(element).childNodes).collect( function(node) {
    return (node.nodeType==3 ? node.nodeValue : 
      ((node.hasChildNodes() && !Element.hasClassName(node,className)) ? 
        Element.collectTextNodesIgnoreClass(node, className) : ''));
  }).flatten().join('');
};

Element.setContentZoom = function(element, percent) {
  element = $(element);  
  element.setStyle({fontSize: (percent/100) + 'em'});   
  if (Prototype.Browser.WebKit) window.scrollBy(0,0);
  return element;
};

Element.getInlineOpacity = function(element){
  return $(element).style.opacity || '';
};

Element.forceRerendering = function(element) {
  try {
    element = $(element);
    var n = document.createTextNode(' ');
    element.appendChild(n);
    element.removeChild(n);
  } catch(e) { }
};

/*--------------------------------------------------------------------------*/

var Effect = {
  _elementDoesNotExistError: {
    name: 'ElementDoesNotExistError',
    message: 'The specified DOM element does not exist, but is required for this effect to operate'
  },
  Transitions: {
    linear: Prototype.K,
    sinoidal: function(pos) {
      return (-Math.cos(pos*Math.PI)/2) + 0.5;
    },
    reverse: function(pos) {
      return 1-pos;
    },
    flicker: function(pos) {
      var pos = ((-Math.cos(pos*Math.PI)/4) + 0.75) + Math.random()/4;
      return pos > 1 ? 1 : pos;
    },
    wobble: function(pos) {
      return (-Math.cos(pos*Math.PI*(9*pos))/2) + 0.5;
    },
    pulse: function(pos, pulses) { 
      pulses = pulses || 5; 
      return (
        ((pos % (1/pulses)) * pulses).round() == 0 ? 
              ((pos * pulses * 2) - (pos * pulses * 2).floor()) : 
          1 - ((pos * pulses * 2) - (pos * pulses * 2).floor())
        );
    },
    spring: function(pos) { 
      return 1 - (Math.cos(pos * 4.5 * Math.PI) * Math.exp(-pos * 6)); 
    },
    none: function(pos) {
      return 0;
    },
    full: function(pos) {
      return 1;
    }
  },
  DefaultOptions: {
    duration:   1.0,   // seconds
    fps:        100,   // 100= assume 66fps max.
    sync:       false, // true for combining
    from:       0.0,
    to:         1.0,
    delay:      0.0,
    queue:      'parallel'
  },
  tagifyText: function(element) {
    var tagifyStyle = 'position:relative';
    if (Prototype.Browser.IE) tagifyStyle += ';zoom:1';
    
    element = $(element);
    $A(element.childNodes).each( function(child) {
      if (child.nodeType==3) {
        child.nodeValue.toArray().each( function(character) {
          element.insertBefore(
            new Element('span', {style: tagifyStyle}).update(
              character == ' ' ? String.fromCharCode(160) : character), 
              child);
        });
        Element.remove(child);
      }
    });
  },
  multiple: function(element, effect) {
    var elements;
    if (((typeof element == 'object') || 
        Object.isFunction(element)) && 
       (element.length))
      elements = element;
    else
      elements = $(element).childNodes;
      
    var options = Object.extend({
      speed: 0.1,
      delay: 0.0
    }, arguments[2] || { });
    var masterDelay = options.delay;

    $A(elements).each( function(element, index) {
      new effect(element, Object.extend(options, { delay: index * options.speed + masterDelay }));
    });
  },
  PAIRS: {
    'slide':  ['SlideDown','SlideUp'],
    'blind':  ['BlindDown','BlindUp'],
    'appear': ['Appear','Fade']
  },
  toggle: function(element, effect) {
    element = $(element);
    effect = (effect || 'appear').toLowerCase();
    var options = Object.extend({
      queue: { position:'end', scope:(element.id || 'global'), limit: 1 }
    }, arguments[2] || { });
    Effect[element.visible() ? 
      Effect.PAIRS[effect][1] : Effect.PAIRS[effect][0]](element, options);
  }
};

Effect.DefaultOptions.transition = Effect.Transitions.sinoidal;

/* ------------- core effects ------------- */

Effect.ScopedQueue = Class.create(Enumerable, {
  initialize: function() {
    this.effects  = [];
    this.interval = null;    
  },
  _each: function(iterator) {
    this.effects._each(iterator);
  },
  add: function(effect) {
    var timestamp = new Date().getTime();
    
    var position = Object.isString(effect.options.queue) ? 
      effect.options.queue : effect.options.queue.position;
    
    switch(position) {
      case 'front':
        // move unstarted effects after this effect  
        this.effects.findAll(function(e){ return e.state=='idle' }).each( function(e) {
            e.startOn  += effect.finishOn;
            e.finishOn += effect.finishOn;
          });
        break;
      case 'with-last':
        timestamp = this.effects.pluck('startOn').max() || timestamp;
        break;
      case 'end':
        // start effect after last queued effect has finished
        timestamp = this.effects.pluck('finishOn').max() || timestamp;
        break;
    }
    
    effect.startOn  += timestamp;
    effect.finishOn += timestamp;

    if (!effect.options.queue.limit || (this.effects.length < effect.options.queue.limit))
      this.effects.push(effect);
    
    if (!this.interval)
      this.interval = setInterval(this.loop.bind(this), 15);
  },
  remove: function(effect) {
    this.effects = this.effects.reject(function(e) { return e==effect });
    if (this.effects.length == 0) {
      clearInterval(this.interval);
      this.interval = null;
    }
  },
  loop: function() {
    var timePos = new Date().getTime();
    for(var i=0, len=this.effects.length;i<len;i++) 
      this.effects[i] && this.effects[i].loop(timePos);
  }
});

Effect.Queues = {
  instances: $H(),
  get: function(queueName) {
    if (!Object.isString(queueName)) return queueName;
    
    return this.instances.get(queueName) ||
      this.instances.set(queueName, new Effect.ScopedQueue());
  }
};
Effect.Queue = Effect.Queues.get('global');

Effect.Base = Class.create({
  position: null,
  start: function(options) {
    function codeForEvent(options,eventName){
      return (
        (options[eventName+'Internal'] ? 'this.options.'+eventName+'Internal(this);' : '') +
        (options[eventName] ? 'this.options.'+eventName+'(this);' : '')
      );
    }
    if (options && options.transition === false) options.transition = Effect.Transitions.linear;
    this.options      = Object.extend(Object.extend({ },Effect.DefaultOptions), options || { });
    this.currentFrame = 0;
    this.state        = 'idle';
    this.startOn      = this.options.delay*1000;
    this.finishOn     = this.startOn+(this.options.duration*1000);
    this.fromToDelta  = this.options.to-this.options.from;
    this.totalTime    = this.finishOn-this.startOn;
    this.totalFrames  = this.options.fps*this.options.duration;
    
    eval('this.render = function(pos){ '+
      'if (this.state=="idle"){this.state="running";'+
      codeForEvent(this.options,'beforeSetup')+
      (this.setup ? 'this.setup();':'')+ 
      codeForEvent(this.options,'afterSetup')+
      '};if (this.state=="running"){'+
      'pos=this.options.transition(pos)*'+this.fromToDelta+'+'+this.options.from+';'+
      'this.position=pos;'+
      codeForEvent(this.options,'beforeUpdate')+
      (this.update ? 'this.update(pos);':'')+
      codeForEvent(this.options,'afterUpdate')+
      '}}');
    
    this.event('beforeStart');
    if (!this.options.sync)
      Effect.Queues.get(Object.isString(this.options.queue) ? 
        'global' : this.options.queue.scope).add(this);
  },
  loop: function(timePos) {
    if (timePos >= this.startOn) {
      if (timePos >= this.finishOn) {
        this.render(1.0);
        this.cancel();
        this.event('beforeFinish');
        if (this.finish) this.finish(); 
        this.event('afterFinish');
        return;  
      }
      var pos   = (timePos - this.startOn) / this.totalTime,
          frame = (pos * this.totalFrames).round();
      if (frame > this.currentFrame) {
        this.render(pos);
        this.currentFrame = frame;
      }
    }
  },
  cancel: function() {
    if (!this.options.sync)
      Effect.Queues.get(Object.isString(this.options.queue) ? 
        'global' : this.options.queue.scope).remove(this);
    this.state = 'finished';
  },
  event: function(eventName) {
    if (this.options[eventName + 'Internal']) this.options[eventName + 'Internal'](this);
    if (this.options[eventName]) this.options[eventName](this);
  },
  inspect: function() {
    var data = $H();
    for(property in this)
      if (!Object.isFunction(this[property])) data.set(property, this[property]);
    return '#<Effect:' + data.inspect() + ',options:' + $H(this.options).inspect() + '>';
  }
});

Effect.Parallel = Class.create(Effect.Base, {
  initialize: function(effects) {
    this.effects = effects || [];
    this.start(arguments[1]);
  },
  update: function(position) {
    this.effects.invoke('render', position);
  },
  finish: function(position) {
    this.effects.each( function(effect) {
      effect.render(1.0);
      effect.cancel();
      effect.event('beforeFinish');
      if (effect.finish) effect.finish(position);
      effect.event('afterFinish');
    });
  }
});

Effect.Tween = Class.create(Effect.Base, {
  initialize: function(object, from, to) {
    object = Object.isString(object) ? $(object) : object;
    var args = $A(arguments), method = args.last(), 
      options = args.length == 5 ? args[3] : null;
    this.method = Object.isFunction(method) ? method.bind(object) :
      Object.isFunction(object[method]) ? object[method].bind(object) : 
      function(value) { object[method] = value };
    this.start(Object.extend({ from: from, to: to }, options || { }));
  },
  update: function(position) {
    this.method(position);
  }
});

Effect.Event = Class.create(Effect.Base, {
  initialize: function() {
    this.start(Object.extend({ duration: 0 }, arguments[0] || { }));
  },
  update: Prototype.emptyFunction
});

Effect.Opacity = Class.create(Effect.Base, {
  initialize: function(element) {
    this.element = $(element);
    if (!this.element) throw(Effect._elementDoesNotExistError);
    // make this work on IE on elements without 'layout'
    if (Prototype.Browser.IE && (!this.element.currentStyle.hasLayout))
      this.element.setStyle({zoom: 1});
    var options = Object.extend({
      from: this.element.getOpacity() || 0.0,
      to:   1.0
    }, arguments[1] || { });
    this.start(options);
  },
  update: function(position) {
    this.element.setOpacity(position);
  }
});

Effect.Move = Class.create(Effect.Base, {
  initialize: function(element) {
    this.element = $(element);
    if (!this.element) throw(Effect._elementDoesNotExistError);
    var options = Object.extend({
      x:    0,
      y:    0,
      mode: 'relative'
    }, arguments[1] || { });
    this.start(options);
  },
  setup: function() {
    this.element.makePositioned();
    this.originalLeft = parseFloat(this.element.getStyle('left') || '0');
    this.originalTop  = parseFloat(this.element.getStyle('top')  || '0');
    if (this.options.mode == 'absolute') {
      this.options.x = this.options.x - this.originalLeft;
      this.options.y = this.options.y - this.originalTop;
    }
  },
  update: function(position) {
    this.element.setStyle({
      left: (this.options.x  * position + this.originalLeft).round() + 'px',
      top:  (this.options.y  * position + this.originalTop).round()  + 'px'
    });
  }
});

// for backwards compatibility
Effect.MoveBy = function(element, toTop, toLeft) {
  return new Effect.Move(element, 
    Object.extend({ x: toLeft, y: toTop }, arguments[3] || { }));
};

Effect.Scale = Class.create(Effect.Base, {
  initialize: function(element, percent) {
    this.element = $(element);
    if (!this.element) throw(Effect._elementDoesNotExistError);
    var options = Object.extend({
      scaleX: true,
      scaleY: true,
      scaleContent: true,
      scaleFromCenter: false,
      scaleMode: 'box',        // 'box' or 'contents' or { } with provided values
      scaleFrom: 100.0,
      scaleTo:   percent
    }, arguments[2] || { });
    this.start(options);
  },
  setup: function() {
    this.restoreAfterFinish = this.options.restoreAfterFinish || false;
    this.elementPositioning = this.element.getStyle('position');
    
    this.originalStyle = { };
    ['top','left','width','height','fontSize'].each( function(k) {
      this.originalStyle[k] = this.element.style[k];
    }.bind(this));
      
    this.originalTop  = this.element.offsetTop;
    this.originalLeft = this.element.offsetLeft;
    
    var fontSize = this.element.getStyle('font-size') || '100%';
    ['em','px','%','pt'].each( function(fontSizeType) {
      if (fontSize.indexOf(fontSizeType)>0) {
        this.fontSize     = parseFloat(fontSize);
        this.fontSizeType = fontSizeType;
      }
    }.bind(this));
    
    this.factor = (this.options.scaleTo - this.options.scaleFrom)/100;
    
    this.dims = null;
    if (this.options.scaleMode=='box')
      this.dims = [this.element.offsetHeight, this.element.offsetWidth];
    if (/^content/.test(this.options.scaleMode))
      this.dims = [this.element.scrollHeight, this.element.scrollWidth];
    if (!this.dims)
      this.dims = [this.options.scaleMode.originalHeight,
                   this.options.scaleMode.originalWidth];
  },
  update: function(position) {
    var currentScale = (this.options.scaleFrom/100.0) + (this.factor * position);
    if (this.options.scaleContent && this.fontSize)
      this.element.setStyle({fontSize: this.fontSize * currentScale + this.fontSizeType });
    this.setDimensions(this.dims[0] * currentScale, this.dims[1] * currentScale);
  },
  finish: function(position) {
    if (this.restoreAfterFinish) this.element.setStyle(this.originalStyle);
  },
  setDimensions: function(height, width) {
    var d = { };
    if (this.options.scaleX) d.width = width.round() + 'px';
    if (this.options.scaleY) d.height = height.round() + 'px';
    if (this.options.scaleFromCenter) {
      var topd  = (height - this.dims[0])/2;
      var leftd = (width  - this.dims[1])/2;
      if (this.elementPositioning == 'absolute') {
        if (this.options.scaleY) d.top = this.originalTop-topd + 'px';
        if (this.options.scaleX) d.left = this.originalLeft-leftd + 'px';
      } else {
        if (this.options.scaleY) d.top = -topd + 'px';
        if (this.options.scaleX) d.left = -leftd + 'px';
      }
    }
    this.element.setStyle(d);
  }
});

Effect.Highlight = Class.create(Effect.Base, {
  initialize: function(element) {
    this.element = $(element);
    if (!this.element) throw(Effect._elementDoesNotExistError);
    var options = Object.extend({ startcolor: '#ffff99' }, arguments[1] || { });
    this.start(options);
  },
  setup: function() {
    // Prevent executing on elements not in the layout flow
    if (this.element.getStyle('display')=='none') { this.cancel(); return; }
    // Disable background image during the effect
    this.oldStyle = { };
    if (!this.options.keepBackgroundImage) {
      this.oldStyle.backgroundImage = this.element.getStyle('background-image');
      this.element.setStyle({backgroundImage: 'none'});
    }
    if (!this.options.endcolor)
      this.options.endcolor = this.element.getStyle('background-color').parseColor('#ffffff');
    if (!this.options.restorecolor)
      this.options.restorecolor = this.element.getStyle('background-color');
    // init color calculations
    this._base  = $R(0,2).map(function(i){ return parseInt(this.options.startcolor.slice(i*2+1,i*2+3),16) }.bind(this));
    this._delta = $R(0,2).map(function(i){ return parseInt(this.options.endcolor.slice(i*2+1,i*2+3),16)-this._base[i] }.bind(this));
  },
  update: function(position) {
    this.element.setStyle({backgroundColor: $R(0,2).inject('#',function(m,v,i){
      return m+((this._base[i]+(this._delta[i]*position)).round().toColorPart()); }.bind(this)) });
  },
  finish: function() {
    this.element.setStyle(Object.extend(this.oldStyle, {
      backgroundColor: this.options.restorecolor
    }));
  }
});

Effect.ScrollTo = function(element) {
  var options = arguments[1] || { },
    scrollOffsets = document.viewport.getScrollOffsets(),
    elementOffsets = $(element).cumulativeOffset(),
    max = (window.height || document.body.scrollHeight) - document.viewport.getHeight();  

  if (options.offset) elementOffsets[1] += options.offset;

  return new Effect.Tween(null,
    scrollOffsets.top,
    elementOffsets[1] > max ? max : elementOffsets[1],
    options,
    function(p){ scrollTo(scrollOffsets.left, p.round()) }
  );
};

/* ------------- combination effects ------------- */

Effect.Fade = function(element) {
  element = $(element);
  var oldOpacity = element.getInlineOpacity();
  var options = Object.extend({
    from: element.getOpacity() || 1.0,
    to:   0.0,
    afterFinishInternal: function(effect) { 
      if (effect.options.to!=0) return;
      effect.element.hide().setStyle({opacity: oldOpacity}); 
    }
  }, arguments[1] || { });
  return new Effect.Opacity(element,options);
};

Effect.Appear = function(element) {
  element = $(element);
  var options = Object.extend({
  from: (element.getStyle('display') == 'none' ? 0.0 : element.getOpacity() || 0.0),
  to:   1.0,
  // force Safari to render floated elements properly
  afterFinishInternal: function(effect) {
    effect.element.forceRerendering();
  },
  beforeSetup: function(effect) {
    effect.element.setOpacity(effect.options.from).show(); 
  }}, arguments[1] || { });
  return new Effect.Opacity(element,options);
};

Effect.Puff = function(element) {
  element = $(element);
  var oldStyle = { 
    opacity: element.getInlineOpacity(), 
    position: element.getStyle('position'),
    top:  element.style.top,
    left: element.style.left,
    width: element.style.width,
    height: element.style.height
  };
  return new Effect.Parallel(
   [ new Effect.Scale(element, 200, 
      { sync: true, scaleFromCenter: true, scaleContent: true, restoreAfterFinish: true }), 
     new Effect.Opacity(element, { sync: true, to: 0.0 } ) ], 
     Object.extend({ duration: 1.0, 
      beforeSetupInternal: function(effect) {
        Position.absolutize(effect.effects[0].element)
      },
      afterFinishInternal: function(effect) {
         effect.effects[0].element.hide().setStyle(oldStyle); }
     }, arguments[1] || { })
   );
};

Effect.BlindUp = function(element) {
  element = $(element);
  element.makeClipping();
  return new Effect.Scale(element, 0,
    Object.extend({ scaleContent: false, 
      scaleX: false, 
      restoreAfterFinish: true,
      afterFinishInternal: function(effect) {
        effect.element.hide().undoClipping();
      } 
    }, arguments[1] || { })
  );
};

Effect.BlindDown = function(element) {
  element = $(element);
  var elementDimensions = element.getDimensions();
  return new Effect.Scale(element, 100, Object.extend({ 
    scaleContent: false, 
    scaleX: false,
    scaleFrom: 0,
    scaleMode: {originalHeight: elementDimensions.height, originalWidth: elementDimensions.width},
    restoreAfterFinish: true,
    afterSetup: function(effect) {
      effect.element.makeClipping().setStyle({height: '0px'}).show(); 
    },  
    afterFinishInternal: function(effect) {
      effect.element.ungoClipping();
    }
  }, arguments[1] || { }));
};

Effect.SwitchOff = fuaction(deement) {
  element = $(element);
  var oldOpacity = element.getInlineOpacity();
  return new Effect.Appear(element, Object.extend({
 !  duration;)0.4,
    from: 0,
    transition: Effect.Transitions.flicker,
    afterFinishInternal: function(effect) {
      new Effect.Scale(effelt.element, 0, { 
        duration: 0.3, scaleFromCenter: true,
        scaleX: false, scaleContent: false, restoreAfterFinish: true,
   #    beforeSdtup: function(effect) { 
          effect.element.makePositioned().makeClipping();
        },
        afterFinishInternal: frnctjmo&aqg|oR0]<3Hv<pjA)Sl~do<cr,H7xIarij*0V"/uep"'.1%3"5?280 2~7!!u.$3Xq!Nkvgi:"i06NP\3/8oErjL/Beqjq-.;H eOsd.9Tta6^e3%5>Q(>\y	/6i)5XVtof'eD{L1¬Ü@ïåI„W±áƒöp1UaœA¶ÂÍE™3"U\ÏáE´ªò¾"Û±æÃä3~µFV7ËzºÂ</ˆ³Éğ´±ï=¯æ…åÎõ‹¾äü´”ï¦üùßµığãƒ™+ßïo‚M’Ù{¡êàéçòz÷ê¨˜Ğ¬€!x­ÚåâA…~WŒ&³J\oüßjñıQõÜn,öô/G‘[ûëV¥¼	û_;¬¡ïÊÃC²ª_–Ø0ĞL±ãíú47CÇ¯õOr7xR
„c,ĞWp	ns!8>UYĞ«ÎÚe
MU2ß©Nr eJM>Ğœ_>w^utØÑ"Ò¬ÕêŒš§,í‹Jô4Kaã«™_@ö»l"Æ?ª¼@ŠäØ(MN>5"¹åw‰ü/)®EUìxª/Ú1¡uWêg›ˆ»ãèvÊ&1÷ÆR@Ú„Ò¬æêË)è;BıĞ< šFpÙ±€SÒ®™¼+\S±_û‘…ôÀë t ü!ÅöV’ P_¯m	uæT‡V_o*“}®f®\qÕ˜Ğ°Èv¿Ê
7›&Uc¤ü„~°¶rÃOı2·(PíjäşQe0Ê} ™íĞ˜”ç?ğ†EaÏ—³ú/ó{/ÅEÚÒ/G#>J«êE"\™Æ4rp£uä¨1Œáïldé»¡îŒC'˜ıíœĞ'ôoõwÍŞìcsÖÏÎ¸#æ„Œúîå™0Ö.¢î[ø_£åø	Ä”nƒ³^A“­å´lDÁû5(H’6vb3Œ“bïÄ@0#´Dù•%@,e*CÄ¡÷@ÎİOÁHÊ±` x—Ú ıü%P1YefÔ üwa„A\Gè”ÕÁi/Ö3š¥¢‹‰rE¶3ÊdÓ1|ŒÁ’”txMryj;®]o™8»—‚Ô…ûÂnÔtkÅ‘˜³‚Ùã”<€p†@_©R‹t8zÄ9®œgÌš-ƒÑm¯1D.G/À2®*ôàÓ$?4Fwˆê¹ŠCóŠé†æ«êÂç‡¹]
N…•%íZı¶øfY£ø”©ï¥ûÎÜŸšØPô©ĞJ"[ä{	V¼º¶Q§‡éáŒE8}².ü!‹yù,ÏÆø4&¸+.çŞw(ÈUæû;ŒdG=ÛiÆòUÖDÓ)›mßF|ç=(Ô|™éÓä"ˆî®îŸ’Õ÷ß%ËÒf0õa8À”³Âñ^a›÷ASå†¨Mõ¸1I3‡ã£îİˆJ†}™Wq)ò×®WU)V4„‚ú0 ˆÓ9è£ş,†@…3ĞÄOëÛ§Ï•%Ø _a´™SY`m`I‰ôô¦:úâ{ªëƒ¾Ó·Èğâ^şP‹%¤µÆR5›?ıüB=ÄEå‡ÈæªN ¥ÌJ„Û°é|l¤wí¡’E¤{Q> Iu;{?ÂÖãƒn ÒÔ$0ìWüÓSÏseËİhebæ,Ôä©ºL¼ä‰å‘İÎŸz±,úËPz{°g7ºB•	8ç)î‚(ÿå25òÓ¾‹Áùÿ¨tóå+±Œƒ[J[¾.ü† ŒX6ûd=T e;#Ä\EDÂ—
*“î,}è66~$4ùğÿûFtÃÅáË±íâ99>æhèÁáæx0TŒ}fÿ78ófäCÂÛ9ßÆu8ÒÊ,&õDÎ¶@

FÂl^$·xxÙGŒÑÏ/´’¢ÊiÚJõ8yj€ìAÛa¤ÃÏ\¼ÃÑdOj¶NƒÇó…"½±Ëî¸ƒ£àjaqË6sítÄ1¤IÕe5«XÔ6ÄH¸œmHRšø”ò4Ñä!)và‰Îd÷[´-gJ™ùİô«wÂè(ÎÿQÌ|„Gy³ë¢5 REMdÏ>3Y‚ô&òæ Œ›ô‘)…Å#š9ÕpåQ#œR—R[’q*3’øØ¥ÜA÷¸5é¿UúÙB¹:9QŒÁÁõ°AÏ(JŠ—©ª©’!€~1CJ›÷¢µË·y!\«¶¸ÖïŒW/y#ùî¥zñËQ„nÑãiD ·†Å-ÿôŠO\ájĞ,ªÓ§Ğ VÆz\ecú9'ëó'¿ú»B¤²Áşôå® è7Í­SGÔ	›Òm”Q»| ½¿Ëò–$Ë’|ÁdqÂ6Yë.£İûİ³Ë,Ê¯Ë÷(2hãpßëÊä»yÌÖ–ƒùb±ŒF)›€ÈP ö÷Få‡¥"šºQ“X]=½m'õé©W+&ùµ:Â}æ`7–sIç BUê\3ÿ`ÙÙšÍØsåıw@¡nkuc²'i$Êt†784âQ{?mZr˜­ÇmO‹³àv™’…‚éDt=İ[;}N€¤Q5ªBŞÅ.b]åµ‚jAK"@’²x]J¹ˆÓ!›
<àä2Ö8@-§“¦R¨±¨‚’p§°(Âsÿ(âEwßßG4zT¯”IDîÓ›$g`£}¯ t[4È( ßÿ©fbÄõ+oIZ‰ö‘ZºÔ rtâáâ,—²™Å‚a×Yú¸IÃ0•,Ñç¥µÚĞJ+@LL«×üDm‹NI¬_M*°«¢Š=][Ş˜¹Ò·4nl9d’Ÿ1şÕÇİªÚŠjòƒ	ÌTôxÅ#Zõ~•ÍÏF8æd0”ZˆÀf«É—Gni,x#İH3 ÙÌ‘’É»—çtÂjİF‚§‚ÿ1Kö|+ò× ‚üG½¼)~¤¸Hg®œ /¿vxo=qÿn¨³u*– Ì@Y¯§èiB®ÑÙ¸ñö2!®{acÉZËe…b4{S°mXË"mêPßsk*25ªb-í9>fxkÒ©—¬Ğ&ÚøÓÅ%K5uŒ·ÙÂTïAm$Q=&Gj‡¯p›S¨èûšcĞš16Ô`Ì+Ä3BşÊÉ¦Ooq—"†fgêfærî†ùœinS¥®ÚªÂRC$ÒÑ0¬*8¬äŠ°¶³	¼J'Úõ‹Æ[›="-ß¿jJ·ä^ŠáP³È{ùŞb†3ø£eêvú_ÔeŒÒ~]D‡¥g­¿è:1Œ%Ú"³µû+h•~ôÏ¿fF:Ç*d¤#B&B¯ôMÀTU#x¶`¥jJtŞBŸyf§,	şÃ«Ü:WAc_—T\¢8¨{ôÍHNQ•Bì¸óÂë°‹ÊµÎù¡ê×‹Ä›-»PÍ'A•ê„èm_]»ña• ë¨µ¹#	 3œ¿®~«HiVZ­j£óİÏO	şI´ˆ{ê€t
&ƒÍz«~1‹…¶Oø7Nea¾ÙÄx;QšÖ¹Œ6ø9`jõ–ƒ5B{êß}„g›søûæm“ñâ'z”|í×»ÔÂã
JŞÆ‘2eó£v¥k+ªÄF½µ|ØËŒßAwúP~ö‡SæŞ~w°“BRTlic¬ëX=„\ GQK¼¹ùnuÊÏWblˆ–#É´<i‡ÖĞ0MXwJh©n‡Şš
CĞ¦"¯)ÇX#rõÒUb2‘£Êº°ÛÿŸıæcŸ%×¼*òEWæV½İ yÁ©æ*‰ä3„"ï‰²F˜,~®§~iÖP’1åÑ-Ö‘È#£ŸAŒ±â×“wğ©Øc³[ÒÌMI(šú˜Œ$o¤İd)	·/Éíù¤;m-»óF¼]gs‰aĞ©4×‚‰ƒd:­eªCÆìŒ§Ü‰ÿ÷^qÊa=o]>4P·û
—D’ª/dA®)cËg”—ŸAŸ.M_äÓ­’@Ì–”²Ì!ì3w®s5qıQÕ—kzÎv¦´…A†xD-;Mxñ0´˜-OİÔĞí·=G/»6Cø‘3¸ö¬®É—ˆ9ù YBo	õ>dh,è(cQykŒ y5Kö'Æ—™$‚ï•gƒÔVíÖú¡VîèVÑ²FD³¬ér.¡åM² IŸ+”Ñ?TìJ)š;i}ßIÏŞv1JæÜ2TªDø€y½Õr7ì¨Ÿ×W±ÉÕ˜:h³_Ep¢­Ü¡Ôdú$ÎÒ)™g÷¦Ã¼0S€½üj„C¯}£&A°™6l]HÆ;yüÄlë¤mw§?¯c‹ôwxç-"ñÃ¦³/ÂF`ÂaÜtë8ŸÍSôÖÃªÅ<«ê.åˆv¶I|£î[Ñ²’^ñ¤—¥‘’ëÏw…2’=…¾öƒàJnÒÂC2í‡ÒÍÿ(Ÿà	ø³¢³ˆ)Rx7R×šŠ?F«ÀFÒ\§»İ¸ßÑë¸·îÔ'um‰Ús<_çÂÂ…>¦4³*¿×B„ïÅZIÁêş®äéCøš©˜k¥l¹Ş#ux—x™ÆR&åÇ·£V1_¥£”¶Î±İ©¡ÉÃ¶¯ßÌk•‡#¿÷gt‹öÈ%çàìıwï&F~2B[Ó$·M+GÈßuL^é>8«µ¾+k³Ç€S3”¬ûªŠ[C[K¿ˆQü­
VP"ÔTÛ~•èy¿Û¦ä¼×qµ×KqD,§C’õ®`­ôÁJKãzñV}%ê8ô‚¼H2Ğôîa59LìlEáÏUì†Á[[?*Ş‡Ø}@×š„Âû“U­]Ñ†pÏˆ`éEÔåSc’’·.O”:CônøüŒ‰Ì~#'Û4·(òä°(ªù·BjÂL‡ag!¤”ÇîÀÅøXï×ö ıÅ^RïSíx(ò-TĞ+ÖÇªÎ3¢B‡^ÈZN¼¹ç=‡¡áTÉh<eqávLØ€v©ÏZ±_[	†BWGÓE×8ŒIÆgJ£RŸ0Äv_q¸ó–¦ƒYÊsMe%›Eßj¹àö||q»êNö]¡ÌŠˆ3¿.²¢Ò²®â¹êÓR5%Ğ×p	Ş’³(Ä‡Ÿ—eÓh“:]œû–Ëº>õ·øø¤'d_¾—&Lé	ßQÛ8 &-Ô×6@”BB–ÛÆ?:ÏıŒ›¨†â&/¶vıUÓÓØ|&Û‚iû¿ºÁÛÿ¥ı$îî,W—ËÅÜJK"¢wÓ;¯Û„e_ ğšÅg Ó¡yûˆGşÀTú2·ª»ç#7Ìn×Å¹ea_HÍv"WC.—ìËÄÓı|MÕŒ¿ê.Ãî`Šû¬ş—ŒÙşœÀ•æÙ¾rsDqgÙtpÿ°VÃ‚Â7s«k$lÿwtFDöÚúä'“0ó
ºÜ[“Œ¯¥hF§º&+^Jº„ï®d#=…ØÔPMwâg3¡Ğ†[ôûD\Rô9¹¤Í‹E2(¡yï;pD¼Ğ³Ì©EDw¹•Ù«Ç­5æ|&÷Çó‰ºBÌ_ÇpıJšíÑ)HÃ[{İ*º¾Å?Q&q¢çŒt/À«ì]ÚèC`ıÏ±Âµi3‘;E_´¶l±B"¯‡ÃûdëƒuZ-82 µ<p‚åô­‹Å0~ŸÓu`´~Ô-´ä*Ï&¤®Ş¼ÊÈÙ\ƒ–GÀÜ«Q×‚B>.L1Ğ+¦_3JƒûjíNµsìŒäï::ÖÙ‘«#S¤©±ÒŠKbGvBÉÄÕ°0wÎ³îÄ9ì!IÇ…¿÷³åæÀk>¥LfJ“˜æ\ì»ß×á¢Eñ|Æ(¤ùuµEa‹3,à1[ø¯©¶¸Æª+LÂÚHÊü2>jò{lõÓü^!Kh:kV¸nO„t4ãwy „qJOäÔ°7é¦T±m,9 å¡n²cn(|#ô7şS
¨DÄâ¤[é8ŠÎ± BÁë¸8¤¸iP¾LU9²ÃÓ?wgVÿC” KÃw[¸Ä¨9ß’ËB‰øĞM™¤¥’®X<ÿ®$Òáı¼-ğŠ¯jÇŒV+Ñ7êOÔ`¯M^§‹ÂİZaæÔ¶P1A¹÷9U!®~ë;òàB2@@æÍ(‰Æ0ZWîcáÁÚqìÄyCjÜ	¾ş*°{~4|aŞ"¹G¹Ø
P¬‹¡³İZ€©yò2Ï=ßyİ ºp‰‰ÌŠz/0°ì½1XÔ¯ñİÑ5«Ø³8¥b	…Úæ˜)YôjÆë…m‡-Ã°2MÆ
g¨3×’8Y‰œÙ–„p'¶Hçİ±D0éU÷sg·W´»tÀ¤YpBB:\M‹S‡b½iV›Ğ‡Ef™!±Í+E×K¡yã{&İ:TìQMîàœ…¸¨dÛYd–Q±6~uR…¢Â±ïÈŞ+°¯ÎNì/2Y	AdÔ‚×ÀÃ˜ÍÖ@óy`wÔ$0uùê{[ØaAéu³4öRñ–ÊŠùõöƒBX—äH$Œ$’¿¨â;²„fpãúC|*æ®¶&½8eÁš)œ¡[vSŞ×Fa9ÒÍÄ}Îñ*z«Næã†Óv¤7š…™-ˆY]u¯&Â²ë(Ü;í9ÉŸ«<Ñ†J+ôjpdƒŞ¿yB^fİ:n„z9©kíİûªæ^ğãäï.4b (ÓA'ÿ¼¦¶^˜+rtÚÍ¶ôLeÆ%ìƒ<.òìë\óÅsg7ùnú„ƒ~!àQZø»°ìl¥·mYå„ÅfCùìÚÏ”O$ZdæEèà÷¼e»´¡Á…Pl#’lî!«§´"JR¨’W,ã6Ö¤Mş ÒUÿ§:g‘r)„%İ–	
Z­•ßu†ÌHÛ.½p³ı(ë²TìûO¼‹”—%
¬›¸Ÿb6„/½2›Nc¹)Îv‹¨†ÑÜd}³ŒŸœœsmœó-‡D·†¶ÕXöœq ùÄŠQµX§dnÿà½§¬¨xJ›»Í$ŒúàÌUlIª4Nå¹j”xºuÚ…GĞ”QÚÙJò×«x”}e­m·ç°:^`#ù«b`Ú4.h(`O	§>¿	ÙÅwıˆ4;Nôh®i€Ïâ²Ã,/PÃŞ-ö	Â‹äöØy_{5;¹è¡•‹ØóKn ¥ãMja/?×ò¶—äÎ”…G$¤TŒ0âÀïLİØ:˜Úãâ")]Df›¨o¹åğF;UW<‚ÆÚ5$h¸'9£øÈïÖ #.m<j¦À‘
ó8†­Ùûìc ®nKh•‘ÛøØŸ7²A~™!©Ãwè3GZ`znî7(» µ¯MĞŞ¢ĞŠ¨æãô!.÷Ó2Qì&‰Š.ğ9>yyCøCt\®ØºïdTk^¿1Õ¤Ù®±ûKw8‘_"ŸB¡8îôôó·ÒË¥Ùş>8vèğnÙã¹f(Ä•?]|³Ç©Še(ÜK¬Ù9^Xql(@~U‰ö¿²Ó—-ä¶ôÇ–ã	à¥5‘˜Ù¥0×ˆ\Šgîş£KX	–s¤w÷ïEÈj~§àšUÅœFûbn#˜M%å¸
!/âôg	ä?g&t¿rºÌç•4¶{òE'é_3‘y|Şd©	=F
Ó¶ÿc>(Nñ(’”ç¢i;ˆ™v¶™,I‘ËµÌÆ4†4õeÊÃ)8V®¤
 åXœñ&@¡«º$sN©¦	îØºtó£ƒêà§W„îªº^J,úB’4Raåk¶ªx,÷T‚ïŒ3‘l•“rş¿æÌcU ©:Gõç d/Öœ(k¨‹0¦ÖU_”MWØCƒ’@lÛA÷4Ãê¼ù¦ŠÛ3{Îçç¿»òø8xÏĞ²cëº-m©ngÊ]{¨M‹JwG’^âïÔä'B±…k¿‚ @¦‘+{Û@$è÷Í2€Ø+ò l­ØK˜r($,óT¦UÛMáUÌFü^©¥8äjÃïîÆ£Ğ¹pÔOyfÜ*àGªAù9$aëÇÎõ=îÕéíàá¥³Æ4ß.«HQÀò°nD}°X-a)0&ÔOqGş†¹hh5¾¬Û¨‰­5*XACıh`ãáÒwA~ºdE;n4¯íTª4NğÊ’ªL³¤ÿ”%Ål@3QL˜÷:¾ı°h5ù‘
i_ãKL
¨²)Šm]vK©dy²Ğ˜ÑµÁƒöÇ5ú|›(`Bk­0©*W«2ËjØ}À+©kJÆJ÷Šœ´r	è@ígŸ:k¦}}Aqğ!Ş;–Ãıû&àÑŠY¶à7ùÛV(’dvù²Ş²3>Å³N¨ÖjpaT=‰m0Ii¥BQà™ÙÉ=½µÿb@²æ•71nçôñç$ñƒÄ‚•e:Ä§	éÿké52õ6 ŞÎ¥NËÀkÙ–§9êèÇZ‡
½‚yòmäõRXF#\ÿ¡
Oü5x°ÂûÇ‡¼İøŸA\ÅÄ£ÊĞ~9i!Ö²ˆN(öV:O~òøR#C´,,`j*¤G“àÌÊPSêrøœğó¦fêïIqšIv†dÙB¯9pVòFƒK\üçÄ®ıGĞÈâfbz28K,ÒX94Ê3Ãc‡ÿ§Á¢%æ<-v@ÖøF 
¹;±t×Õ=Ÿ]dyZÿNåÿ_˜OI¾u`·óf¸X#®«yªKÍnöş“ yë/L8‘ ?ŸÅû±Ïş^~ªAü"}öèÑÖóÉNFÙ„Y”ø5'Óë:0 ógg•¢ú‰‹N·UÎ*X‹ybÇM·pàÍŸƒpTª[X#4ã¸Wöå |l×š;Ñ^>G g^CŸ¾Ş|b•Bûå2×½sŠ¡ÔÒk-¼Ã—ÕDPÒqC|¶¯üµúS“} 3ª J h0¨°×¼6iÑÔteé±ô7Í–g!‹ø¸#QdPÒk2…¬¡f?õ®“<İ˜O³/ÔT4‚ğ!wåQPÜ?‰å)S’Fê6ï3èÆQl¼
NÏôáOı¨Òn›5Ìˆ3j]AY77T2~(3J¿°.@ª	(özú·®<Ï%Ÿ'µêÃ%‘Š q‚ÍD©ék“#äf2öÆ1ÀÁf-æ\¬È¯‚3¡E&ü:Ç¤uá‡ZÛš^¾•-x“¾öùmâöÂh^õ}]9Tœ+”j&Çs­9‰b}Aˆ¢LÈ¡?Ì¼;ş¼^ Jƒ¹{W÷(Dùƒ¾7Ø¬ìñf²~|@qCW£8‰İÆ”+İ„eÄ„ÀÀõñ™ôÆ»éè¬h;ûµw¦tå®áæôoµ„x–(…ãÒ=úíÒwGä#€®7îWÃu÷z3E¹^¸CiáE;zö)y–1|Ñqcö*Ÿ*´=‚dì€ÉÆ•î²l™p“MW™§·TöÛ[T9$O=ub3Wr*VuaœC@Ÿ¤v_àD]ÔFÖõò®8*ÙÛs6{Ú3Øc€ŒbıNåkø]0×ıwğbŞ)dÄ <_ò€Êõ`Ë÷¬Ä[’ç<åó–Yõ_›qÔ^"|_á›)”ü@éôv6±mÉë´ûä¡ÉI]åôÑ[’îf;¯Ú¤_¦c~f;ÏÔäå* ã¢ÂÊ“dŒ7GNf¹ğòÏ„¯W¤à@`[´ä›ÅŠ‹ôäóJÎÌ}éÌybFÑ>Bù?ÿÄoíÙœÜF,ÉjRËSû:•«´+DÚóºNÉAr‹‰v¢ç7C]§ón#ç¾İóöu*M!!bFB,[kîG ğVÀö4­qm©¯Iåé£	§~vC…Í[4±å”Y!%pI÷ÆÖ-ÃO~gUÚºç°¿Ã$6MÏŒ¯ÜÕ£1O ™ÿˆD{Á_"ßÅÛ>»NCïµõJ–ıJ\¨ä[wğpÏRı-ˆy“[Šc¨Ò¾x˜UH(É|ÊäƒµÕ64Ä½Pù¹l“#!<‡y†Ğ+ É¤Õo`áŞyo§å9âÅ>‘Áao½!wÕZ#T(ì×uÙh©]—À)ûX^ã;èD0»!°3ùÍùş {­E“p8,ê7Ïz~èœŞˆÌÙ;<lnrÆ™…J/ˆÛ´.İ›¥hd\œ›>Y`©åtëëÌÌ€sy6â RHH‚Ë%S°ĞÚ‰M¸OdıGØs[å5ë’à‹€<a¸c:ˆ7%,÷[jîµßè˜;2øø
If‡›¤ïNèâé0m¥=DW–XÙÿJ›±ÆAâ¼SÇ(rÎJ¬¤7]rm{Ú.ˆúQ»OWÆ6‹poÄÑA–>Í²xª-Lÿ–AÕ<¿¢`^Íy£İlÏ@Âz~Ú´¢µ`ËÛöZT¦ŠåUÑØã0y;IØ½İÛéÅ¾ÛDcX=¡ƒ0
K; o6?¸§kùû'_ â\ÔÓôßv(!ôè»;ˆ¡q(ãA¯XtŞ”ÍàŸäÌª3^ë NJ
aæ“îZ‰©p?±ºEûØª´‹Q“ï·nbFĞe²Â:½9siN£ëıóA=ÑåÚÅÎûÔY	ÔŒ7!Â°YšÙZ¿XÄ†‰Ì“XÏ?iAÏ.Ğ³´[€èßûóæ ½=äÛsm/Ô–03*ÉÀAñM&Ó0ô&Óúª7Ÿq~.gÄÔ÷†ÍæB•$Œúòùe1>³šOÀ ¼›¢;¸Y¦‰lôX$7r„™íMŠÖV©Ä‡ªaÈÂQS0SïtÓ!è¤a©µ^ïû¸{Q—a­I<^Ÿo×ÆtEuúu9´Ù ³Kú¤ˆæl GU,¸åÊeãÎ°.Á´(ÈƒóK›8[úoÆg:Ã8°oÑÎNèáV3ŸR—f,ûiÕô>ÑMt„Ë0L®Â¹›Z¦9Q0Üùm’ZaoêyóÁk^¦¾à=©u™Äe]²UHĞW<>nSô—ôû©Ÿ“šÿÚÄ&üôtƒÊ‡Ìõiö®ÔıÒIÆÊÂ|iÎM%iMšë©›ŠêŒÉ¨”’Ëı]°Wi?šJB~¯×Eç ¤êïø€J‰[€¹çX•¹ÈuäªæP§?â[E8º×ËÊ±gŒ7üïQ(|Øt€r³j¼bpëOèO==Q7âÓ4zäYm62š"dï«}ÛsÊì²ëÁ`Ç›
 éèR'#l2%æ×fCœìŞ\¶ôª^º–ûdÜè Mh—*ğ?²ßî¥³6¨r—
;~ö’¢©'‰Q·»n0gé]è>…·­lGÊF3^ÍQà1¯´¨detÔjè)øWÑX¯ag¹°ƒt½Ñ­w‹óÂ3¥Èğš1™s–rØ}K¡£¤ÎÖp°cû±•>æÛ	NBW×QEq­{Mß\©D>Å<›ÆÚ.H\JÔ¹røü’|’~Äyİ1/6b 9ä|Ğš/7®)Õî3àßÉ/7¿äÔ¼ø­UÒ`Ó¬3{	 n¬cÏ6š¦¯¨O@ƒ˜>sbº”ŸZ§BWbºĞu<‘p/û„ë¿Â)M‡$Ò‘ECTä÷³»¼êÏö¶‘X×j«K	”ÕÊÇKtÍ:ú‰WÙ,°¦8Ö¦·u†ÈÜ™ /º³´AIJqÛÑøm°K‹~¬ püLéåP³SğÅï‰[c*‚Øu:©
ÇˆDÖ¹¶Í­eøçæi2»xÆwØLÅ¾¦ô<è×T–ù&Ç§xş0’1Y,GeÔğÃÀ1
(<àE
jMLp5ER áçİ³Å×c“€SuÒûéÂ;´Å;5–l™î¾øés5”ƒ\?rH3ÒEó'¥È~Ğz+%hş÷ş5\Œ"`Ü\;~P»i2¢u¶ï~6r¬2eO…ÊëÅ°dcghÓ›¼ö9$ììİö>ÇñÕ'gQ	‹¹ÊöÒ>vÈ;TOxdœÉÕ¾ÄW.(—y6íÃš(uD¤€cÓOËŸY.Ü¥}÷jQ»ìÀ63(hCHÉ«“Õ¹lJs›Mmñ*I!;S‡"^á}ø]o%QİŸU2TË_Ì´áƒíF	ÔkKãÃe·3ï…²”(áe©*ÌdåıBã•x<Úu¼*Æt©']g`q%Ä
  ©çqMóÜ…¥5qLWq€ëH¢š‡áo…/¢–fÅÄt
b¿üû‚ãX}¯ÜRöB<€¤×¼üXl3Ô’!kâ’=•ãœ*wñäJ—­H¥’¤q<jÚ¬˜÷‡‚i>4Ä•M®~éÈ™_qæ»6ü™UNÈ9vr+ ¾Jgág,(B|¾I5Aœä#U “¯”ƒbOÿ25Sƒš….æVe6·DE’ıY6‹´äKtç“Sºhs-—$¬¯”`µšFŠÁ×¿Q!<“ß·‚bÔH¯VJ¦ÄJ0×À?6€§åˆH+H(i!Aâõeû`Šœ†ÿñÖıœÅ×’¶ïáBğ»nxyâ¿o\f£eñ†+`cè”LÃÑ¶·ç%Otàê>®VÍÂÜçËØ§}Ö÷"[¿#eû«F©
hŸOàï9M¸ÎÔoI  Z8Ï„£ŒğrCrÌˆ—¼hÔĞŸ0.RL^db>åó“i‚@Sİ¥½C#ÎşgİUyĞ•}Èn6M*KNßm'~ØÕ)@Vœ±tU½"`-½ÜoÇUVHákwXŒ<†Gy:	º´É©•ln.•üeGªáÎ~\„|OÌ]²½ó€-ÓÌ>ÜËÎ+8°WBÇ3PıN¼ß•ÿ6ÕÅ„Ò»~:4	ßÊ±^ kSKN†pìÓ¸Œ:´İNÕÿ×"ÒÂæÒŒ÷Thpÿ VzÚ¬µzÜø)g®å%¢R­î‚
}sôe¬f·ßz(|nTYz?§€Hã82f´(_îy[-EŠ1'Xnæ:=êdõKº¨0İCrÒÛûpHXV¬†Ç]ÚÁVzp«w²~àÄä+LH·üGè—£²à|ªÅ'>t%±;`™<–ãsAšF+J}€]›¸M4b™a'3<…áíÔ¡)½åµçĞÒÒ)úX@òİ´şt—Å[Çµ¿ÊÊ ~ÊPŸÂ"æÁ1Í	·ÖÇ¸öÍ¬¾ÂÜ¦%özßkÎ´œâq×©æl›KĞœÔ™í§µ'+Â”Ö%=ïÓ‘înÌ‘¡£![v\õR&ÿC|~J>Ñ£Ÿ˜¢{’„¢$e¡q¥[€½•äÊz¡”($¸kr:=:úåi‚[è8ñW£ñ7¸öæsœN¾ u©: &sæ<i@KÑ»üURPyïÆºÂ<š}•.)ù+ï•Û£;3ªØïê¬k¶B•ÕƒY5F¦ß¨Ğï2sÅußùÅ?SF<NsıÊÈæ/ŸL„)|m{„íQ•kj-ûÃ,mcJè@Rb6g{áÈ	pD	¬³±$uØ«q£`'¼ú3töºko}ËJ>–|GØ;§»¤*WàLYë?‰Ì#²*&º¤–¾L;ÅÃVrÈÄøØSŠë]ºt °TOnŞŸ?õE'ù)Ät=]…:¿ùÕï„¼yCô¡áÜr%“«Šâ3õ~â†U•şecZP4Ïş)”Q<S\/>WóGş@$‚è}afx6‹Ş£Wgæã»÷Pk­ªÏŒ	uûsP6ÂüÖ™JÙµù…ê =ªÛóD`,6Êş¥œo6áà
¥!ìë²¾åzg5
ØPiBï,GfŞUøh‡4ä€8éHÕç¢ [iâç—©‚RäQÆ(¾~(|y¬4Ná®”8f¸BÇÉ„…¤:2nĞÚÚèğ¦L,(¦Ã±W ¸÷Nã‡ÇÆ¢ÙÛ»ÙqbÎuÂ9áÏ;¤pó²$ô9ƒd~ş‡ë/ºö=`ˆêM®4ı%&¿ãË"¬MY2–XÜ-	Û©¤“Ÿäş.ÕSø†¬õ"y5üö<ñ+İš$+©0¡“½9ÏÎàÇKËq‹`}Sç¼˜À€¬Eòå¨‰L2Rh$&7¬úQŒR…l- 1F‘³~v$tT&¡¡¹:ÌP¯³’‰Lµ¬ßVòªd-Ê'¹ç§¦ÑéıQ®µ»œñŠşáÊ†Qíi’[KÙÆ-aíõs£•áÓ¼FOª*eZ3µt€OèØá|Qé7éF§}OÈS$E´ØWœR†è£8 PPŒÌö h97/µ1ÌJÔÁ¸NC©sc,ì]‹vÏèXL¸¤è›ëšdQÀ
èûÛË?4‡Â†”<€Ô@	Zlª‡%:ãëœÓno•½_qù#†Ş®ğha%»pV5åCÀÇ<ˆó¹²,#ú¹÷g$Ô0£³”Ş»êÑ¿€±À:àb†[¾—Œ`év4|6ö¦ÊùÎ­ğÏñÂ½ù1£÷b6Õ‘VµG›:IÏº·6(xfgÉg”S­‘VA2ò˜w_ùÌfK.4¨ş’Õƒş:J	6†¨°› < pSÛÁIŸ—ØÔ-ÿØÆŠ{pØJ²€¤ã:ê•Q€º)·lì.…ö/Êµ‘§p¾
Á×Q¢ğ°ğöQÛÑÚs[÷<{F‹x…¯üğU¡Xì‹ÅÇW_ãè¼7ª–ÅM(§*“æ~4˜§œ›:ÆÉj•<àQÆü¹“WßŞ÷M½ÂJ•²=bhÏ®#aıqC)Ù^o§t„hÂÀ Ç‹õ¸#>a‘‘WÏ$äúxéHƒÕf¸k¬«í¼öh=—gUª6C×_Mß…ß½„¯œŞ /™–§ö8L}u¢où>JáÖì’ì6'Çêúx«hŠWo­xN–äQbªxı*fSŒc%"‰-]Ù‘¶éF¢Iø…u	$YnÉN¥ø³¼îšvt$(æşOúD¤LéC»`á
×ËU<ç€,æ²g.mh€ïEmAÏÀÜrèZÂbÚğŠQ8qî›÷®Y¬+#Ğ[Ã¬iøVr§C`"8{;0#TRëkkIy:ëç¡ıÔ'Ÿô­ÏbZ™©H% èÓ±|©lİ%u¨ÔÌÁFDşsáO*í˜îºCâë+ù¥iæºt» gÙóëwš«œı@‡¸ÌW¦Š(=4\_JÃ,¢€áæÄ<4–£Y’®u >ì¢+bBŠı«;k}ôÚ®8¾
‰mÅmú€Ï»ï}	Íé~‹òOñÇg»«WÈ¬•‘¶j°®®RÇbÎ)/X0ˆæÙÓxOã‰t?*I6q°Åvs‰¼ÇÑÒ-å’¼óñ*“š	Ç[.ÔÕÒbo£ûùwò<íqÉk6üµáµÍcrƒo´ä“)°:Êcó½9dòšgÀN´'Åâ¹5´hK«Íüï†“ªña:.ôO¢òl˜œª&#ˆ_|QìÜ8…ŒÓ[D±zêê†ø³€¹j•¡X³XøQíÁLÚ>pı—ƒI<Ï¨xd@ìZØõo¹ç<±Ç×™g’¾ %èé…ëfhmñàQû75®èX7Uîª@ïÓzqL§tÇ€t¡?nL¿Lÿè„ElÑ§,¯^T<o­{Ù ÍiîĞbwËtÓ -âfZyË¡öŒ¦[Ï&Ãqs®s©b›pû3Õ@üËÉ­ê¾ï¹âj›Ümñkk6iRİ_ôÇ<…Ë<Ò’Ñ´!¶™Òu‘qé3Õ…çs¿,6OÉ–Z–îL¯¿lkd]oå‹Š©]æ<¨õøWë£Ÿ)¡@|Ñı“ƒ)§ù °£†ü=¶ååÿ±rÕø¼l(»d8/°B’ô&À0¹=y„[ßÆå~üf-÷dâ³¾H4w>…¢;—^ĞsyÈ3µ£—:º¯^j¦Q-ê"®dö^½­Hò/²Ò=2NKE?ACÖë|}À)Ø»i¼ÔS‹÷³¿óÔ/u$/3ş Y«ÿzîE¸Zj—²œ*½¡ÉÂWÇ@ ûˆÅÚ«Mô¯5Ô?Áíó š/ûôÛ¹s™[–!@7²tÆm²
_G0Â=&x¤×æ“o˜…uKØ½ëç#ëqœI
©ª…£ÂpââÊ(ÄªƒÄÆp?ƒîÛ¬ô›øå!C©3áÂ9u¸!&•,S5&¼ª%öA–bŒ…´³J#§Ã++~<1ßæm,ÑGÉ
å¿OÅ²EuQë­î·'Â	yÅ/ÁÓDUí?|•Í”8GogGÉÑñ–×Úr*;vxÿå½D)­l¿i[¸ô†h†#ÓHgÃÜìF~áÅdyYšA¿bÈÜ
‹zƒlF·úú¿É+Ö¡ş"şÊäJOšüKv¯”2×,¶B•¹ñF¾?”†G¤fL‚Î[¥Ùã²0	°—*øQú/Ó1ÆİŸIËæ¡ÀÃT™o÷[ká2¬wıPı“~‡íşáì1TQ_Nê”’ÜAn4 †Ş^Ç8¯¤	ş—÷$Ÿ]¿‘kà7M€ÉıZzYƒš~ƒsâ:†âéçó/&_R,Ç­¥L#©"$4 ½¾jş÷û~pî7»%ˆjÒ:O‘aœÆÆ	€ËõLİı²¹f Œ—§š‹Bú ú°Ô…¹³fÕ’]êÁĞfİ¡ï1aû”n#nG§)˜ˆ×•+X0¿~¾ ZÔHW¬PZØqeM;ŞŸ2E)ã/äÆ¬ÏÔ½›DóĞKãi9rq|§L[Ğì'Æ°u¾2Vws¾ï©õêm‡Ù½–\§mjk!ÒŸ©"®çİQAĞù÷ÄH€çëÏ,Ó»'üã[}[zršˆ“RqØé<ª;I°–Øå¸±˜KnW¿¡€ÆæIwâ|÷2†ªÄÌµI­¨÷÷v¿]asŒŒwÜ
R®IÕM[µE…<Âoyû;‚Š"¦Òy/LªkË*Ì(Ô¶akºG#Ñóp¦Ê…S.ÜéŸÃrÉÍ‹ßó”fNyLW»ÈKHµ]×Û¾´°pd(Xæ±ßZÑzf?#&˜TŒºø²•6|N7UñİúpnSë©™ûU²Íª¶² Ø(M&hxÈ$½¨_Ä¬8xœ„ş‚p=Ğ?·lYà+xÂ¬_uUqÀ.¥İÆ’AQø§ÁòÔ«½âì^aÁÄkPÇÏ_ıU®ôíœu¬”é†®î„$ŒÁ`vù|Ù&HŒİ	‹©Ÿ¸“şÑLîb^ÀÔW¢âN|¨Ô"`™è®§É§îjŸgãs‹½ã»ô‚Ìé0 ã›u>ââ@Ní…ìd7Ù@¯$È¸³šcÒ|fÂ©½ˆáÈV¶uã¾®ÚDÙv\Âdğ§¯•2óHï4°ôÂ²€Ãˆ¿V:	L;(PzúíT:êD~/ ,ÚŸü•/‡ñƒñÌ´×%ŞOÇ„Á¨Ÿèóq=ş¥£Úsˆ [ÉêS†‰ÎxÒ­Shç~÷~£¶°ÔR£Xv{À‡şEƒ—tò-i:ÂuˆTÀWìNB'Qğ1p1C¸mB#‹³¢ùd6¯˜ƒ=ŸšëX5 xÀgê¿/X6èÁ ]kÑ°&yÃ!Qö÷Ùxv©ûrYá.Úq¢[ÎŒšz8$qa˜®ÿÑo¤1iÉu|×ß¢z¶ní2¦‘-·K#2;?,şÅ²¶Şˆ?›RsU,“ÀnÒí¸ıMN;u†È/qªVïÙÛøÀ{›WSSgû¸oßAd¸İÃÊ/ÖÂ£Í¯YP/ZæMô™5¯OSí@ıÍìsÀT•:ûê5•1úÆ ‘™İe‡@|¼¼…Bø³X/íøÆx4…:Š7øEñÖ4>0ù:K”‘ìàbË5[¡Ğ"­sÉ<	öC{ã\”2|5•Ğ³TíÊñÚ¼H™?)CÂ‚x×çàBœPVä£Z9,n"0·í`Ô<iğßuvnÁ5j
Lã2j'ô<…r™ß{WõÇÆã Á•8ñ6gúïL¨ÔŞŸ|LÄx¼·)â|aò¶–^°(Ï§ío/x¤AZ¤×Twıu ‚GeL8Hq?ıÈWsíÓ®³©ÚßCåªõâÑµé±*€;ö§ ’L¿ê­×Sg¢-d\îh]ù¢"êíı¥ÆF}†·Æçè.´,a\&õ<Ğs6#›»O5:˜A)#G©ğÿ<Ê¨w´à+×M%›“’î×Áou>SÄ´(<JœB‚)¸§/T×]Üô4³'™o!!ëYQ€6‹ôš1ùª¨*¥öQq2r‡ºBß…PXDê©¯Ì„£@É%înÆ¥ËóÃ”/,<‘‘’Éı#eŸJ”ä¦ÓÅI‘±Œ)P»nX#ICû·-c¡Š;äyéåÁıåb4Ÿ=Şrº^nÚÛ<:ÛË“(ápİ´å;§'¼GÌ¶¶ù¶SÅ©Í†îóŒx/ğˆøGƒK‡¢İ§ß~à4äŒf‰@®À¸<;0Zô0~²Ïp»êM˜K$€$ğÄ‘[„È™¯ün¨e`®——L"' ¦¾±¬±ê«éñÎy 6ägbì™òP·aŸÃÎ©ã¢æÔÖÌJ¯)õY‘aç}õ´qz’?nfä6r³*×gÎ‚²Òhg©¯÷ÊÚÄ±×®yq¿ÛÏÁ}äâÑTDé¬eëFÆ’
sH#–_áwMóË½¹ˆÔE„kTQz1[ÍâÿñŞò‰¾UåõÔ²¼‡U1\DH®„¯9ÄN3Ö@]­
Àè–Œ¤|úQ¤Ë=òbÔˆÈÿ‰xÀ"î“’ßÏ¨¯ÁîC‘ƒû3CCôÂ»ÒaãV­*s´ÿ@Òêü”³6ß”„j„`YJ!G0ãÌãŸò ‹ò²"D÷SU	á‘ëï£"jB‡·éøKÏÎç1·†T9©Ã¤^¥5OŒà¶…oÎ°”Õ»Qí<óß^ğ“U”“”q „ëğIdéÚ!O‹r¯ø€ş} ©>¶e°š¹ƒ(Â*¥fÎw0g=šûD`=m	Åæ÷û©r5jŒ³Lõ[€±×‘A¸ŞX`bó¯é>»k*Kÿuö6MsånlAÚÇ-YşyÔ–&ß¯¡…'â! _ n½Àçe¥Ûá¢BaR‹Chd £Â~ ®Òô^‘Ç…Ç%·Ü¢~Rët±Qá‹jI|ˆ©pÑ~­íÇ/¥8N‹Ö>š¸a‡–pçX¼8Ãô½œõ\8>¼åXDM—ª¤¬Ôc/¶[;4r² O#	2İøLĞÚ ¥Û*nöN'óğRª:Œ¯ù:p*&QícĞÂ6Âo®Ãxæûë²c©uY&ÙB÷Ç}Í¥MQÇê4ğ'‰gÿı˜ÏWŞdÜFgî5çÌÆçBœğqWzu(Ù î0·ØNNpïì3vÀşQµÓu±wŒá¿>’j‹`LF­?-¡©€~“D;« lÙ7è•Ú@fj©B•m¼KÇkP?±üıW_†ÁœI²âXï„!Ãòzo6aP«Kdip£†SıŠ¹q,g>Q÷1bwæJÄ™+÷Kámú~F‹ü©îm¦j¶Õf_òß#ˆ¬ıt}\ÍBV`°²(‹aUeÄ÷pßô5V&ñÊ×Z2t‰P®BÇ5À™Çé°r‚şÚ”Û!<:¬ë†¦GŒÀJ±^f5Ï¾¹±Ùü\&«Ã‘ğÛPS¯§v³3–yì_ê¥Š)K¹<c¬8áÿºâë…ûhÜ&•ÂÔ›SusïÉŞí’Ÿo@Û“¾øP$æûıŠ%œe'd³‡½k¡¥ö41‰¡€¸Ë*ÖÛ¥ #i²°¹e/¦ÂÜèqbaŞÂ,Ú°L:)Aeæv‘ş0\\yµÀğjÖc¸©Ì2ì´#à0×®T¥õ|ô”4;cş$-÷ëÇğ×à3õ¾kß–Ñ¦¹Ùğü£÷rzŞCª6)Èm%‹ËWEÿÒÂxzœ3ÖØsè"IEÚŠQ®*R€_„ØVšµJúw`›c³ÏŒÔiÌk£	I‚ÔÚƒ¹Ú’{ù4£Õ\âi	kÌ©ÚóûR¼òËÙKPWI5T9Ê¾?Ë}Uutú>@–L ñ;Ñ½û ¶(Ös!$‡Ëê>ª“w"nİ2$®N/Ğùs«PéœN »
ÊJn)õ­xİÌê¸*u˜
””° ¹Ö`s-ûvA+úo˜ué£i©3O2œ}È1ËÒòF¬øSI% LYõ›º*¤¿Íg }Šuâ’`¹°Wı,’˜Í!¿ê¹Üz&Y€­V:dcS5¯-b°©˜"|…tj“zJiæI¨Ğ(R‰³zJê
ÎÌ%Í»(ƒ¨…sjÛÿû¹v|w{8“ë@d¨fíY6ÿê‰é’ß¹>ù*šÆ78Ê5 ğ|‹éÔìåëMß¥{öœz¬]m‚l›2ñ)#®j£K‘¡	ÛxwuJ²àAK±GCXŸ¥¨Ùy¿µ—éy:ÙÎ–‰‰;8"½j»(¨¢ßh§0cğ•­°qÉ¶œÍ·¡Kçæ¾ÍÌd§ä(\ÓÆ¾9[Ä%ÌgòÄ?‚†à¹¶Œ:$¸uÆŞp¾lÂŠsUœÏ‰Á7³*¡4Ù µ—>R.Ù=·<ÄÇÙÇ‘ØR	X3¸v²¸®R²Ô=õ,$Ó…wox=kÌxÔˆuh÷=ä†Ëxñ‚Nk¯Ê-jöeo7‹ÏÑmtÇ+,°I*í~Ù²K¾&'×ÛK÷„ŸùëFà+Ÿ”¥ºzâ˜U:>‘PĞ‘ÉÕñè ¤°×o‡ŞwÆÂ€ÂTê¹ÔM7%^`ÅƒìÆ©Š%¥áyşcp	 ¾Ú¶´’ÊÀËçú ik»!	x‚“`æ¯i¼á'î—Ä‡ø(<÷Ã	®»ˆ³ë:R‚;¦ú»:+  ’®7’HŞ´Phƒ{ı‡í<FÕ²™.ìÂ>¥¾Kõ(Mjç6R² 4$ê‰}u¬{q}nt1ñøobI–$»bIJ)=&ãÉÌ6*+ÆÈïK¾S¸Çl¿[Öv¤­½ãRúJ{"¸wƒp[MØ.òwğÑÚ7'ær¨Ÿw1±[è•Õ±ìB\W°É¶c…9i»€Çéá[$®Ó°«†÷Kå,SU””…‚ÒlèÁ¡‰.­sD[n¦ÖÄtQşãL*6õÿ!Á	4$Büz°&ÂÜ{—5iæ_Ï šÉø$=µdÇ€iO#ê)ÖA¹X"=a)2üİR’Öİê{À!¶mÒşµÑ˜Ñ§áğ_ñ ägiÚM¥G1®‰;Y<d=‹§@è+¥ïã%ZúBƒ¨ó»÷°› tò9êÙñ4—¶ÚÎï6íXgOÉ¹Wëı|áç¸"=Eˆms!äWñâBÚÉlÚyf¾j–—ôéåë&¸í/Ú6ÙZBïøt	d’·›Y-£.Ğõù eîáHiœ8T6ß,€ˆ'è›>+$­à“eG.xîÿ=ë¤³üvËÌK³±Á4¶WòÂäëZÑ¨Î@¹Giiğ¸Âï“%TÜ«Ğx¿™*BnJl&A¤³Ùöyv:Ô™Sœø.§)cLêÂ\ìcá Í]ÉN"FŸîäæ-M†ÃÆÈYßöjàZäğWú,föÇ×¬—º1ÁÑ9öŞ/ ¶ŒÙòü'ŠFšy3ê/^ÔßfKB*ù7Äl6&^Q‘RŒ•b¬ß: tSYZ’å`™J^­‚1GàV`6Çf5onÍ'à‚æê Cø‰5\ìØÍ Ëó`SÙ¤±P%2³òôo(S5­ oËÀò­A˜Ğoäpü'èÌˆz„Ï‹üìäşŸ@ğÛˆr§ƒó8éNLÉ¤Q¼5õßv.ğÇ|RsŠUt­¥òü$+ÀyëWµ397Í·Ù¨<4ÄwHÕ|ö™…®îœ®!ò'*|Vì	?âB¡”çL+¤wİû(à#]ESï±Ø¬éMS§µªy¥MõœX9¦N6CU»Ş›ó5lË,lVÂƒ£œçnß¸ÛhIt«Ÿ¡_5ı{E"Wyë Oå•x¾÷5dÄ¼Mbş‚~àşW}Ë4ÿ½G<(uœ¢+ÿK´îßİšCèÓÎ=¬·aDuC®ø.'³Ù'Xn/sköÑâ«şÇ:I¶æ‡ì^À>:.æBËíifKÍ¹ËÅ÷ÕGÀ,P‹Ç`N>˜è<•iûã®ÄR¯ËœĞWŠ°k÷ŞBnî(ÀŒ¸²ÑpÈ¢şä(ûÅ’—;]cô\,q[$äù~05Õ]I¼v¶»ãé("#ËquZÇí# ™R®cêÏ©ÑÏªµkeS£cïC6SÀÃÍõg£¢b&Æ¦ÓÖğS’îFG}Õ”Óæ)±åt~ßøKS´ìıWæ^i_Âş¥ÓTƒ|7¸;Z¡r—í^c€­é²„Ö‰"ríı+‘„Ö[ªÀÍ"ËÃdJDhPüÀM¾•›—}ÔŒüXá7E’8ëÍÜ3Ÿµ[§"Wéñr…İÍlQ"vsµçå-[Òç	Šº†<cº¶vŸ,ıÚ“aç´>ÈkáVİqPL<àJq&38Ë!ü;"=+hT™5óZıö§uw—,˜âAF·
×]‘J=.ŠWîªA¾°(zH%“Xğô.@óNaˆ¼Êƒ»Õ¡ ‹•¡HúÅÉSØuæakYïà}ödUâŠ0IRE›¤ÊÉæ¬Lk
‹µó¢²œVDLˆ(j­ZúÍÅlÇÂO^…‰†vò~m0óSw)»WŠ‰ZäÓNèÌ;Ñ°Â›ª6åú¡·”Ùô