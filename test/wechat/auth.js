const chai = require('chai')
const sinon = require('sinon')
const rewire = require('rewire')
const sinonChai = require('sinon-chai')
const constants = require('../../core/constants')
const config = require('../../core/config')
const utils = require('../../core/utils')
const wechatMock = rewire('./wechat-mock')
chai.use(sinonChai)
let expect = chai.expect

describe('auth', () => {
  let requestStub
  let request
  let authCode = 'mock.auth.code'
  let userId = 'mock.user.id'
  let openId = 'mock.open.id'
  let token = 'mock.token'
  let expiresIn = 2592000
  let weGetUserInfoStub

  beforeEach(() => {
    BaaS.clearSession()
    BaaS._config.updateUserprofile = ''
    request = BaaS.request
    requestStub = sinon.stub(BaaS, 'request').callsFake(options => {
      if (
        options.url === BaaS._config.API.WECHAT.SILENT_LOGIN ||
        options.url === BaaS._config.API.WEB.LOGIN_USERNAME ||
        options.url === BaaS._config.API.WECHAT.USER_ASSOCIATE ||
        options.url === BaaS._config.API.WECHAT.AUTHENTICATE
      ) {
        let status = options.url === BaaS._config.API.WECHAT.USER_ASSOCIATE
          ? 200 : 201
        return Promise.resolve({
          status,
          data: {
            user_id: userId,
            token,
            openid: openId,
            expires_in: expiresIn,
          }
        })
      } else if (
        options.url === utils.format(BaaS._config.API.USER_DETAIL, {
          userID: userId,
        })
      ) {
        return Promise.resolve({
          status: 200,
          data: {
            avatar: '',
            id : 22075549131219,
            is_authorized : false,
            openid: openId,
            _provider : {}
          }
        })
      }
      return request(options)
    })
    weGetUserInfoStub = sinon.stub(BaaS._polyfill, 'wxGetUserInfo').callsFake(({success, fail}) => {
      success({
        rawData: '',
        signature: '',
        encryptedData: '',
        iv: '',
        userInfo: {},
      })
    })
  })

  afterEach(() => {
    requestStub.restore()
    weGetUserInfoStub.restore()
  })

  it('#handleUserInfo param value is undefined', () => {
    expect(() => global.BaaS.auth.handleUserInfo()).to.throw()
  })

  it('#handleUserInfo param value invaliad', () => {
    expect(() => global.BaaS.auth.handleUserInfo({a: 'b'})).to.throw()
  })

  describe('# loginWithWechat', () => {
    it('should set storage', () => {
      const now = Date.now()
      const nowStub = sinon.stub(Date, 'now').returns(now)
      return BaaS.auth.loginWithWechat().then((res) => {
        expect(BaaS.storage.get(constants.STORAGE_KEY.UID)).to.be.equal(userId)
        expect(BaaS.storage.get(constants.STORAGE_KEY.AUTH_TOKEN)).to.be.equal(token)
        expect(BaaS.storage.get(constants.STORAGE_KEY.IS_ANONYMOUS_USER)).to.be.equal(0)
        expect(BaaS.storage.get(constants.STORAGE_KEY.OPENID)).to.be.equal(openId)
        expect(parseInt(BaaS.storage.get(constants.STORAGE_KEY.EXPIRES_AT))).to.be.equal(Math.floor(now / 1000) + expiresIn - 30)
        nowStub.restore()
      })
    })

    describe('# update_userprofile', () => {
      [[null, 'setnx'], ['bar', 'setnx'], ['setnx', 'setnx'], ['false', 'false'], ['overwrite', 'overwrite']].map(item => {
        it(`should be "${item[1]}"`, () => {
          return BaaS.auth.loginWithWechat({detail: {userInfo: {}}}, {
            syncUserProfile: item[1],
          })
            .then(() => {
              expect(requestStub.getCall(1).args[0].data.update_userprofile).to.be.equal(item[1])
            })
        })
      })

      it('should not be included', () => {
        return BaaS.auth.loginWithWechat(null, {
          syncUserProfile: 'overwrite',
        }).then(() => {
          expect(requestStub.getCall(0).args[0]).to.be.deep.equal({
            url: config.API.WECHAT.SILENT_LOGIN,
            method: 'POST',
            data: {
              code: wechatMock.__get__('code'),
              create_user: true,
            }
          })
        })
      })
    })
  })

  describe('# linkWechat', () => {
    describe('# update_userprofile', () => {
      [[null, 'setnx'], ['bar', 'setnx'], ['setnx', 'setnx'], ['false', 'false'], ['overwrite', 'overwrite']].map(item => {
        it(`should be "${item[1]}"`, () => {
          return BaaS.auth.login({username: 'foo', password: 'bar'}).then(user => {
            return user.linkWechat({detail: {userInfo: {}}}, {
              syncUserProfile: item[1],
            })
          }).then(res => {
            expect(requestStub.getCall(2).args[0]).to.be.deep.equal({
              url: config.API.WECHAT.USER_ASSOCIATE,
              method: 'POST',
              data: {
                encryptedData: '',
                iv: '',
                rawData: '',
                signature: '',
                code: wechatMock.__get__('code'),
                update_userprofile: item[1],
              }
            })
          })
        })
      })

      it('should not be included', () => {
        return BaaS.auth.login({username: 'foo', password: 'bar'}).then(user => {
          return user.linkWechat(null, {
            syncUserProfile: 'overwrite',
          })
        }).then(res => {
          expect(requestStub.getCall(2).args[0]).to.be.deep.equal({
            url: config.API.WECHAT.USER_ASSOCIATE,
            method: 'POST',
            data: {
              code: wechatMock.__get__('code'),
            }
          })
        })
      })
    })
  })

  it('should call silent-login before force-login call', () => {
    return BaaS.auth.loginWithWechat({detail: {userInfo: {}}})
      .then(() => {
        expect(requestStub.getCall(0).args[0].url).to.equal(config.API.WECHAT.SILENT_LOGIN)
      })
  })
})
