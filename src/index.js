import { _make_flat_group } from './tool';
import { EventController } from './event-controller';
import { _ScheduleController } from './schedule-controller';
import { _TimerController } from './timer-controller';
import {
  _EVENT,

  _STATUS_INIT,
  _STATUS_START,
  _STATUS_MOVE,
  _STATUS_END,
  _STATUS_CANCEL,

  _ON_FINGER,
  _ON_DOM,
  _ON_EVENT,

  _TYPE_UNKNOW,/* eslint no-unused-vars: 0 */
  _TYPE_CONTINUOUS,
  _TYPE_MONENT,/* eslint no-unused-vars: 0 */
  _DEFAULT_LONGTAP_THRESHOLD
} from './define';

export function addEvent($dom, config={}){
  var type = config.type;

  if(type === undefined || _EVENT[type] === undefined)
    throw '请配置事件的type,或者检查拼写正确';

  var on_which = _EVENT[type].on;
  
  //初始化dom里面的储存结构
  if($dom.__event === undefined){
    $dom.__event = {
      list: {
        [_ON_DOM]: {},
        [_ON_EVENT]: {},
        [_ON_FINGER]: {}
      },
      IDGenerator: new IDGenerator()
    };

    $dom.addEventListener('touchstart', _bus, false);
    $dom.addEventListener('touchmove', _bus, false);
    $dom.addEventListener('touchend', _bus, false);
    $dom.addEventListener('touchcancel', _bus, false);

    $dom.__event.bus = _bus.bind($dom);
  }

  //设置一些默认值
  if(type === 'longtap'){
    if(config.longtapThreshold === undefined)
      config.longtapThreshold = _DEFAULT_LONGTAP_THRESHOLD;
  }

  var list = $dom.__event.list;
  var IDGenerator = $dom.__event.IDGenerator;
  var newId = $dom.__event.IDGenerator.new();
  var group, _info;

  //添加事件配置
  if(_EVENT[type].on === _ON_FINGER){
    //finger需要打扁
    group = _make_flat_group(config);

    //基事件需要被转化为单个的group
    _info = {
      id: newId,
      $dom: $dom,
      config: config,
      group: group,
      groupId: _get_group_Id(group)
    };
    list[on_which][newId] = _info;
  }else{
    // dom/event的事件储存到树状结构
    if(list[on_which][type] === undefined)
      list[on_which][type] = {};

    // config是否都应该设置默认值?
    // 配置一定是需要配置上默认值,这样就可以实现配置和代码的分离了
    // 但是不同类别的又需要不同的默认配置就..唉心累啊
    _info = {
      id: newId,
      $dom: $dom,
      config: config
    };
    list[on_which][type][newId] = _info;
  }

  //返回controller
  return new EventController(_info);
}

// 内部实现

var _schedule = new _ScheduleController();
var _triggerlist;
var _bubble_started = false;
var _dom_involved;// [], order from bubble start to end
var _last_dom_involved;
var _group_progress = 0;
var _during_gap = false;
var _actived_finger_num = 0;
var _timer = new _TimerController();


function _bus(evt){
  // 原生事件,定时器事件都走这个bus
  _triggerbubble(this, evt);
}

function _triggerbubble($nowDom, evt){
  if(_bubble_started === false){
    _bubble_started = true;
    _bubblestart(evt);
  }
  if(_bubble_started === true && $nowDom === _last_dom_involved){
    //不过一般一个bubble的执行时间不会那么长的,不过如果使用了模版编译之类的,就有可能很长时间,
    //本来打算使用一个frame的时间结束所谓end的,还是不行,行为就不同了
    _bubble_started = false;
    _bubbleend(evt);
  }
}

function _bubblestart(evt){
  //尝试去触发groupstart
  if(evt.touches.length === 1 && evt.type === 'touchstart'){
    _groupstart(evt);
  }

  //更新基事件的
  _update_base_status(evt);

  //事件发生源,生成triggerlist
  _update_triggerlist(evt);

}

function _bubbleend(evt){
  //尝试去触发groupsend
  if(evt.touches.length === 1 && evt.type === 'touchend'){
    _groupend(evt);
  }
}

function _groupstart(evt){
  //初始化这次group涉及涉及的dom
  _dom_involved = [];
  evt.path.forEach(function($dom){
    if($dom.__event !== undefined){
      _dom_involved.push($dom);
    }
  });
  _last_dom_involved = _dom_involved[_dom_involved.length-1];

  //判断是否重新schedule
  
  //生成schedule
  _dom_involved.forEach(function($dom){
    var groups = $dom.__event.list[_ON_FINGER];
    var info, base;

    //需要判断是否需要重新生成group
    if(_check_need_of_regenerate_gourp())
      for(let id in groups){
        info = groups[id];
        if(_schedule.group[info.groupId] === undefined )
          _schedule.group[info.groupId] = {
            status: _STATUS_INIT,
            group: info.group
          };
      }

    //根据现在的group,初始化base
    //每次都会清空状态
    _schedule.base = {};
    //更具目前group的进度去初始化
    for(let id in _schedule.group){
      base = _schedule.group[id].group[_group_progress];
      //基事件使用type->的映射就可以了,细微的状态更新方便
      _write_base(base);
      if(base.after !== undefined)
        _write_base(base.after);
    }
    
    //初始化完毕
    
  });
}

function _groupend(evt){

}


//工具函数
export function _get_base_id(config){
  var type = _EVENT[config.type].type;
  var opts = [
    {
      key: 'finger',
      value: config.finger
    }
  ];
  var opts_string = [];
  var after = '';

  opts.push();

  if(type === _TYPE_CONTINUOUS){
    opts.push({
      key: 'startWidth',
      value: config.startWidth
    });
    opts.push({
      key: 'endWidth',
      value: config.endWidth
    });
  }

  if(config.type === 'longtap'){
    opts.push({
      key: 'longtapThreshold',
      value: config.longtapThreshold
    });
  }

  if(config.after !== undefined){
    after = _get_base_id(config.after);
  }

  opts.forEach(function(opt){
    opts_string.push(`${opt.key}=${opt.value}`);
  });

  return `${config.type}[${opts_string.join(',')}]{${after}}`;
}

function _get_group_Id(config){
  var opts_string = [];

  config.group.forEach(function(baseconfig){
    opts_string.push(_get_base_id(baseconfig));
  });

  return opts_string.join(',');
}

function _write_base(config){
  var type = config.type;
  
  //特殊处理longtap
  if(config.type === 'longtap'){
    if(_schedule.base[type+'_'+config.longtapThreshold] === undefined){
      _schedule.base[type] = {
        status: _STATUS_INIT,
        finger: undefined,
        threshold: config.longtapThreshold
      };
    }
  }else if(_schedule.base[type] === undefined){
    _schedule.base[type] = {
      status: _STATUS_INIT,
      finger: undefined
    };

    if(_EVENT[type].type === _TYPE_CONTINUOUS){
      _schedule.base[type].startWidth = undefined;
      _schedule.base[type].endWidth = undefined;
    }
  }
}

function _check_need_of_regenerate_gourp(){
  //判断标准是是否目前group有中间状态,并且是否在gap的期间
  if(_during_gap === false)
    return true;
  
  //检查是否有中间状态
  var group;
  for(let id in _schedule.group){
    group = _schedule.group[id];

    //group的规则和base的规则有区别,在_STATUS_的部分是指向对应group末尾事件的触发
    //其中的到因为触发groupend的时候,状态都会被更新到cancel/end,所以不会出现start/move的情况
    if(group.status > 0)
      return true;
  }
}

function _start_bus_bubble(evt){
  _bubblestart(evt);

  _dom_involved.forEach(function($dom){
    $dom.__event.bus(evt);
  });
}

function _update_base_status(evt){
  //这里是同一的分发,感觉需要做一个函数分发,阅读起来好一些
  switch (evt.type){
  case 'touchstart':
    _touchstart(evt);
    break;

  case 'touchmove':
    _touchmove(evt);
    break;

  case 'touchend':
    _touchend(evt);
    break;

  case 'touchcancel':
    _touchcancel(evt);
    break;

  case 'longtap':
    _longtap(evt);
    break;
  }
}

function _update_triggerlist(evt){
  
}

//update status trigger, 这里仅仅做更新触发器
function _touchstart (evt){
  //更新finger信息
  _actived_finger_num++;

  //更新tap status->start
  _schedule.set_base('tap', _STATUS_START);

  //longtap 的16ms的定时器
  _timer.start('longtap_debounce');
}

function _touchmove(evt){
  // 需要检测目前的状态,如果是触发tap的cancal,基本上每次都会去触发的了
  // longtap就会触发这个cancal,所以这个cancel,tap会触发两次,所以是否有需要触发一下呢
  _triggerlist = [];
  _trigger('tap', _STATUS_CANCEL);
  _trigger('longtap', _STATUS_CANCEL);
  _trigger('swipe', _STATUS_START);
  _trigger('swipe', _STATUS_MOVE);

  if(evt.touches.length > 2){
    _trigger('pinch', _STATUS_START);
    _trigger('rotate', _STATUS_MOVE);
  }
}

function _touchend(evt){

  if(evt.touches.length === 1)
    _trigger('tap', _STATUS_END);
}

function _touchcancel(evt){
  // 目前还不是很清楚touchcancel的触发时机
  console.log(evt);
}

function _longtap(evt){
  _trigger('tap', _STATUS_END);
}

function _trigger(type, set_status){
  var status;
  if(_schedule.base[type]){
    status = _schedule.base[type].status;

    if(set_status === _STATUS_INIT)
      throw 'init不应该触发事件的';

    if(set_status === _STATUS_MOVE){
      _schedule.set_base(type, set_status);
      _triggerlist.push(type);

    // 要求状态往前推进
    }else if(status > set_status){

      // 不允许init->cancel
      if(status === _STATUS_INIT && set_status === _STATUS_CANCEL)
        return;

      if(type === 'longtap' && set_status === _STATUS_CANCEL){
        //longtap仅仅允许做cancel的操作了, 包括longtap_debounce

        _schedule.base.forEach(function(id){
          status = _schedule.base[id].status;

          if(id.indexOf('longtap') === 0 && status !== _STATUS_INIT){
            _schedule.set_base(type, set_status);
            _triggerlist.push(type);
          }
        });
        return;
      }

      //start/end/cancel
      _schedule.set_base(type, set_status);
      _triggerlist.push(type);
    }
  }
}