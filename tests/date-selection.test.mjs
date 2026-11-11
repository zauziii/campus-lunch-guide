import test from 'node:test';
import assert from 'node:assert/strict';
import {todayParts,shiftDateParts,buildAaltoRecords,shouldDisplayRestaurant,formatLunchHours} from '../menu.mjs';

test('selects calendar dates from Helsinki time across year, leap day and daylight saving',()=>{
  assert.equal(todayParts(new Date('2026-12-31T22:30:00Z')).iso,'2027-01-01');
  assert.deepEqual(shiftDateParts('2026-12-31',1),{iso:'2027-01-01',token:'01.01.'});
  assert.deepEqual(shiftDateParts('2028-02-28',1),{iso:'2028-02-29',token:'29.02.'});
  for(const instant of ['2026-03-28T22:30:00Z','2026-10-24T21:30:00Z']){
    const today=todayParts(new Date(instant)).iso;
    const expected=instant.startsWith('2026-03')?'2026-03-30':'2026-10-26';
    assert.equal(shiftDateParts(today,1).iso,expected);
  }
  assert.throws(()=>shiftDateParts('2026-02-30',1),RangeError);
});

test('a future published menu is not hidden by the current time while today is unchanged',()=>{
  const snapshot={restaurants:[{id:1,name:'Example',priceCategory:'student',weeklyHours:[],menus:{'2026-11-09':{
    lunchHours:{start:630,end:870},dishes:[{name:'Chicken curry'}]
  }}}]};
  const [tomorrow]=buildAaltoRecords(snapshot,'2026-11-09');
  assert.equal(shouldDisplayRestaurant(tomorrow,20*60),false);
  assert.equal(shouldDisplayRestaurant(tomorrow,null),true);
  assert.equal(formatLunchHours(tomorrow.lunchHours,null),'午餐 10:30–14:30 · 官网');
  assert.equal(shouldDisplayRestaurant({...tomorrow,lunchHours:{status:'closed'}},null),false);
});
